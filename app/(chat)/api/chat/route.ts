import { Agent, run } from '@openai/agents';
import OpenAI from 'openai';
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
import { 
  getWeatherTool,
  createDocumentTool,
  updateDocumentTool,
  requestSuggestionsTool,
  careerCounselingTool,
} from '@/lib/ai/tools/openai-agents-tools';
import { isProductionEnvironment } from '@/lib/constants';
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

// Create OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    // Create OpenAI Agent with tools
    const tools = selectedChatModel === 'chat-model-reasoning' ? [] : [
      getWeatherTool,
      createDocumentTool({ session }),
      updateDocumentTool({ session }),
      requestSuggestionsTool({ session }),
      careerCounselingTool({ session, chatId: id }),
    ];

    // Map model IDs to actual OpenAI models
    const modelMapping = {
      'chat-model': 'gpt-4o',
      'chat-model-reasoning': 'gpt-4o',
      'title-model': 'gpt-4o-mini',
      'artifact-model': 'gpt-4o',
    };

    const actualModel = modelMapping[selectedChatModel as keyof typeof modelMapping] || 'gpt-4o';

    const agent = new Agent({
      name: 'AI Assistant',
      instructions: systemPrompt({ selectedChatModel, requestHints }),
      model: actualModel,
      client: openaiClient,
      tools,
    });

    // Convert UI messages to text input for the agent
    const lastMessage = uiMessages[uiMessages.length - 1];
    const userInput = Array.isArray(lastMessage.parts) 
      ? lastMessage.parts.map(part => part.type === 'text' ? part.text : '[image]').join(' ')
      : String(lastMessage.content || '');

    // Run agent with streaming
    const result = await run(agent, userInput, { 
      stream: true,
    });

    // Create compatible streaming response using the proper async iterator pattern
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let accumulatedContent = '';
        let isControllerClosed = false;
        
        const safeEnqueue = (data: any) => {
          if (!isControllerClosed) {
            try {
              // Format as proper SSE for Vercel AI SDK
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch (error) {
              console.error('Controller enqueue error:', error);
              isControllerClosed = true;
            }
          }
        };

        const sendTextDelta = (delta: string) => {
          safeEnqueue({
            type: 'text-delta',
            textDelta: delta
          });
        };
        
        const safeClose = () => {
          if (!isControllerClosed) {
            try {
              controller.close();
              isControllerClosed = true;
            } catch (error) {
              console.error('Controller close error:', error);
            }
          }
        };
        
        try {
          console.log('Starting OpenAI Agent SDK stream processing...');
          
          // Process events from the agent stream
          for await (const event of result) {
            console.log('Processing event:', event.type);
            
            // Handle different event types from OpenAI Agent SDK
            if (event.type === 'raw_model_stream_event') {
              const data = event.data;
              console.log('Raw model event data:', data.type);
              
              if (data.type === 'output_text_delta') {
                // Text delta event - send to UI in Vercel AI SDK format
                accumulatedContent += data.delta;
                console.log('Text delta:', data.delta);
                
                sendTextDelta(data.delta);
              }
            }
            
            if (event.type === 'run_item_stream_event') {
              console.log('Run item event:', event.item.type);
              
              // Tool calls or other run items
              if (event.item.type === 'function_call') {
                console.log('Function call:', event.item.name);
                safeEnqueue({
                  type: 'tool-call',
                  toolCallId: event.item.callId,
                  toolName: event.item.name,
                  args: JSON.parse(event.item.arguments || '{}'),
                });
              }
              
              if (event.item.type === 'function_call_result') {
                console.log('Function call result');
                safeEnqueue({
                  type: 'tool-result',
                  toolCallId: event.item.callId,
                  result: event.item.output,
                });
              }
            }

            if (event.type === 'agent_updated_stream_event') {
              console.log('Agent updated:', event.agent.name);
              // Agent handoff or update events
              safeEnqueue({
                type: 'data',
                data: {
                  type: 'agent-response',
                  content: {
                    agentUsed: event.agent.name,
                    response: 'Agent updated',
                  }
                }
              });
            }
          }

          console.log('Stream processing completed, waiting for final result...');
          
          // Wait for completion and get final output
          await result.completed;
          
          const finalOutput = result.finalOutput || accumulatedContent;
          console.log('Final output length:', finalOutput.length);
          
          // Save assistant response
          await saveMessages({
            messages: [{
              id: generateUUID(),
              role: 'assistant',
              parts: [{ type: 'text', text: finalOutput }],
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            }],
          });

          console.log('Messages saved, closing stream...');
          safeClose();
          
        } catch (error) {
          console.error('OpenAI Agent SDK streaming error:', error);
          if (!isControllerClosed) {
            try {
              controller.error(error);
            } catch (controllerError) {
              console.error('Controller error failed:', controllerError);
            }
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'x-vercel-ai-ui-message-stream': 'v1', // Required for Vercel AI SDK
      },
    });

  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Unhandled error in OpenAI Agent SDK chat API:', error);
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