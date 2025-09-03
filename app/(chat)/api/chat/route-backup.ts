import {
  JsonToSseTransformStream,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { careerCounseling } from '@/lib/ai/tools/career-counseling';
import { isProductionEnvironment } from '@/lib/constants';
// Replace gateway provider with OpenAI Agent SDK integration
import { 
  agentStreamAdapter,
  createCareerCounselingAgentTool,
  type AgentStreamEvent,
  type DataStreamWriter 
} from '@/lib/ai/openai-agents-integration';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';
import type { VisibilityType } from '@/components/visibility-selector';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Create mock dataStream for compatibility with existing tools
    const dataStream: DataStreamWriter = {
      writeData: (data: any) => {
        console.log('DataStream:', JSON.stringify(data, null, 2));
      },
      merge: (stream: any) => {
        // Handle stream merging - for now just log
        console.log('Stream merge requested');
      },
    };

    // Convert existing tools to OpenAI Agent SDK compatible format
    const tools = selectedChatModel === 'chat-model-reasoning' ? [] : [
      getWeather,
      createDocument({ session, dataStream }),
      updateDocument({ session, dataStream }),
      requestSuggestions({ session, dataStream }),
      // Use the OpenAI Agent SDK compatible career counseling tool
      createCareerCounselingAgentTool(session, dataStream, id),
    ];

    // Create streaming response using OpenAI Agent SDK
    const agentResponse = agentStreamAdapter.createStreamResponse(
      uiMessages,
      tools,
      {
        model: selectedChatModel,
        systemPrompt: systemPrompt({ selectedChatModel, requestHints }),
        onData: (event: AgentStreamEvent) => {
          // Handle streaming events
          console.log('Agent event:', event.type);
        },
      }
    );

    // Create UI-compatible stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let accumulatedMessages: any[] = [];
          
          // Process the agent stream
          for await (const event of agentResponse.stream.getReader()) {
            if (event.done) break;
            
            const chunk = new TextDecoder().decode(event.value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                
                // Convert to UI message format
                if (parsed.type === 'text-delta') {
                  const uiEvent = {
                    type: 'text-delta',
                    textDelta: parsed.textDelta,
                  };
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(uiEvent) + '\n'));
                } else if (parsed.type === 'tool-call') {
                  const uiEvent = {
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: parsed.toolCallId,
                    toolName: parsed.toolName,
                    args: parsed.args,
                  };
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(uiEvent) + '\n'));
                } else if (parsed.type === 'tool-result') {
                  const uiEvent = {
                    type: 'tool-result',
                    toolCallId: parsed.toolCallId,
                    result: parsed.result,
                  };
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(uiEvent) + '\n'));
                } else if (parsed.type === 'finish') {
                  const uiEvent = {
                    type: 'finish',
                    finishReason: 'stop',
                  };
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(uiEvent) + '\n'));
                }
              } catch (parseError) {
                console.error('Error parsing stream chunk:', parseError);
              }
            }
          }
          
          controller.close();
          
          // Wait for agent completion and save messages
          try {
            const result = await agentResponse.completed;
            // Save the final messages to database
            // Note: You might need to extract the actual messages from the result
            console.log('Agent completed:', result);
          } catch (completionError) {
            console.error('Agent completion error:', completionError);
          }
          
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        ),
      );
    } else {
      return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Unhandled error in chat API:', error);
    return new ChatSDKError('offline:chat').toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
