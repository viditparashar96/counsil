import { run, user, assistant } from '@openai/agents';
import OpenAI from 'openai';
import { auth, type UserType } from '@/app/(auth)/auth';
import type { RequestHints, } from '@/lib/ai/prompts';
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
import { CareerCounselingSystem } from '@/lib/agents/career-counseling-system';
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

    console.log('chat message', message);

    if (!chat) {
      // Save chat immediately with a temporary title to avoid race conditions
      // Title generation is slow (AI call) so we do it asynchronously
      const tempTitle = 'New Chat';
      
      await saveChat({
        id,
        userId: session.user.id,
        title: tempTitle,
        visibility: selectedVisibilityType,
      });

      // Generate proper title asynchronously (don't await this)
      const uiMessage = {
        role: message.role,
        content: Array.isArray(message.parts) 
          ? message.parts.filter(part => part.type === 'text').map(part => (part as any).text).join(' ')
          : (message as any).content || '',
        parts: Array.isArray(message.parts) 
          ? message.parts.filter(part => part.type === 'text').map(part => ({ type: 'text', text: (part as any).text }))
          : undefined,
      };
      
      // Generate title in background and update chat
      generateTitleFromUserMessage({ message: uiMessage })
        .then(async (generatedTitle) => {
          const { updateChatTitle } = await import('@/lib/db/queries');
          await updateChatTitle({ id, title: generatedTitle });
          
          // Trigger a background fetch to update caches with new title
          // Don't await this to avoid slowing down the response
          fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/history?limit=20`)
            .catch(() => {}); // Ignore errors from cache refresh
        })
        .catch((error) => {
          console.error('Failed to generate/update chat title:', error);
          // Keep the temporary title if generation fails
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

    // Initialize Career Counseling System with multi-agent architecture
    console.log('Initializing CareerCounselingSystem with multi-agent architecture...');
    
    const careerCounselingSystem = new CareerCounselingSystem({
      session,
      chatId: id,
      requestHints: {
        longitude: typeof longitude === 'string' ? Number.parseFloat(longitude) || undefined : longitude,
        latitude: typeof latitude === 'string' ? Number.parseFloat(latitude) || undefined : latitude,
        city,
        country,
      },
    });

    // Convert UI messages to proper format for multimodal input
    const lastMessage = uiMessages[uiMessages.length - 1];
    
    // Check if this message contains analyzable files (images, PDFs, or documents)
    const hasAnalyzableFiles = Array.isArray(lastMessage.parts) && 
      lastMessage.parts.some((part: any) => 
        part.type === 'file' && part.mediaType && (
          part.mediaType.startsWith('image/') || 
          part.mediaType === 'application/pdf' ||
          part.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      );

    // Enhanced message content for triage agent with file attachment context
    let triageMessageContent = '';
    if (Array.isArray(lastMessage.parts)) {
      const textParts = lastMessage.parts.filter((part: any) => part.type === 'text');
      const fileParts = lastMessage.parts.filter((part: any) => 
        part.type === 'file' && part.mediaType && (
          part.mediaType.startsWith('image/') || 
          part.mediaType === 'application/pdf' ||
          part.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      );
      
      triageMessageContent = textParts.map((part: any) => part.text).join(' ') || '';
      
      // Add file attachment context for better routing
      if (fileParts.length > 0) {
        triageMessageContent += `\n\n📎 **ATTACHED FILES:** `;
        fileParts.forEach((filePart: any, index: number) => {
          const fileName = filePart.name || 'unknown';
          const mediaType = filePart.mediaType || 'unknown';
          triageMessageContent += `\n${index + 1}. "${fileName}" (${mediaType})`;
          
          // Add likely content type hints for better routing
          if (mediaType === 'application/pdf' || fileName.toLowerCase().includes('resume') || fileName.toLowerCase().includes('cv')) {
            triageMessageContent += ` [LIKELY RESUME/CV DOCUMENT]`;
          } else if (mediaType.startsWith('image/')) {
            triageMessageContent += ` [IMAGE FILE]`;
          }
        });
        triageMessageContent += `\n\n⚡ **ROUTING HINT:** File attachments detected - likely requires Resume Expert for document analysis.`;
      }
    } else {
      triageMessageContent = String((lastMessage as any).content || 'Hello');
    }
      
    const { agent: startingAgent } = await careerCounselingSystem.handleConversation(
      triageMessageContent,
      uiMessages.slice(0, -1) // Pass conversation history excluding the current message
    );

    const agent = startingAgent;
    
    let userInput: string | Array<any>;
    
    if (hasAnalyzableFiles && Array.isArray(lastMessage.parts)) {
      // Extract file URLs and text from the message
      const textParts = lastMessage.parts.filter((part: any) => part.type === 'text');
      const fileParts = lastMessage.parts.filter((part: any) => 
        part.type === 'file' && part.mediaType && (
          part.mediaType.startsWith('image/') || 
          part.mediaType === 'application/pdf' ||
          part.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      );
      
      // Get the user's text query
      const textQuery = textParts.map((part: any) => part.text).join(' ') || 'Please analyze this file';
      
      // Get the first file URL (support multiple files later)
      // Handle different possible file part structures
      const filePart = fileParts[0];
      let fileUrl: string | undefined;
      
      if (filePart) {
        // Handle different file part structures
        if (filePart.type === 'file' && (filePart as any).url) {
          // Handle file type with direct URL (Azure Blob format)
          fileUrl = (filePart as any).url;
        } else {
          // Try different possible properties where the URL might be stored for other formats
          fileUrl = (filePart as any)?.url || 
                    (filePart as any)?.image || 
                    (filePart as any)?.data ||
                    (filePart as any).content ||
                    (filePart as any).image_url?.url;
        }
        
        // Debug logging to understand the structure
        console.log('File part structure:', JSON.stringify(filePart, null, 2));
        console.log('Extracted file URL:', fileUrl);
      }
      
      if (fileUrl) {
        // Determine analysis type based on user's query
        let analysisType = 'general';
        const queryLower = textQuery.toLowerCase();
        
        if (queryLower.includes('resume') || queryLower.includes('cv')) {
          analysisType = 'resume_review';
        } else if (queryLower.includes('text') || queryLower.includes('read') || queryLower.includes('transcribe')) {
          analysisType = 'text_extraction';
        } else if (queryLower.includes('document') || queryLower.includes('paper') || queryLower.includes('form')) {
          analysisType = 'document_analysis';
        } else if ((filePart as any)?.mediaType === 'application/pdf') {
          analysisType = 'pdf_analysis';
        }
        
        // Create input that will trigger the file analysis tool
        userInput = `I need you to analyze a file using the file analysis tool. The file URL is: ${fileUrl}. The filename is: "${(filePart as any)?.name || 'Unknown'}". The media type is: "${(filePart as any)?.mediaType || 'Unknown'}". The user's question is: "${textQuery}". Please use analysis type: ${analysisType}`;
      } else {
        // Fallback if no file URL found - provide more debugging info
        console.warn('No file URL found in file part. File parts:', JSON.stringify(fileParts, null, 2));
        userInput = textQuery || 'I have attached a file but there seems to be an issue accessing the file URL. Please try uploading the file again.';
      }
    } else {
      userInput = Array.isArray(lastMessage.parts) 
        ? lastMessage.parts.map((part: any) => part.type === 'text' ? part.text : '[file]').join(' ')
        : String((lastMessage as any).content || '');
    }

    // Get previous conversation history for context (last 15 messages)
    const previousMessages = messagesFromDb.slice(-15); // Get last 15 messages
    
    // Convert database messages to agent message format using SDK helpers
    const conversationHistory = previousMessages.map(msg => {
      const content = Array.isArray(msg.parts) 
        ? msg.parts.map((part: any) => part.type === 'text' ? part.text : '[file]').join(' ')
        : String((msg as any).content || '');
      
      return msg.role === 'user' ? user(content) : assistant(content);
    });

    console.log('conversationHistory', conversationHistory.length, 'messages');
    console.log('First few messages:', conversationHistory.slice(0, 2).map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? `${msg.content.substring(0, 50)}...` : 'complex content'
    })));
    
    // Build complete message history: previous messages + current user input
    const allMessages = conversationHistory.concat([user(String(userInput))]);
    
    console.log('Total messages being sent to agent:', allMessages.length);
    
    // Run agent with streaming - CORRECT: history as messages array in 2nd parameter
    const result = await run(agent, allMessages, { 
      stream: true,
      context: {
        chatId: id,
        session: session,
        requestHints,
      }
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

        const messageId = generateUUID();
        const textBlockId = generateUUID();
        let hasStarted = false;
        
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
        
        // Safe enqueue for final markers that checks controller state
        const safeFinalEnqueue = (data: any) => {
          if (!isControllerClosed) {
            try {
              controller.enqueue(encoder.encode(data));
            } catch (error) {
              console.log('Controller already closed, skipping final enqueue');
              isControllerClosed = true;
            }
          }
        };
        
        try {
          console.log('Starting OpenAI Agent SDK stream processing...');
          console.log('Starting agent:', agent.name);
          
          // Process events from the agent stream
          for await (const event of result) {
            // Exit early if controller is closed
            if (isControllerClosed) {
              console.log('Controller closed during streaming, exiting event loop');
              break;
            }
            
            console.log('Processing event:', event.type);
            
            // Handle different event types from OpenAI Agent SDK
            if (event.type === 'raw_model_stream_event') {
              const data = event.data;
              console.log('Raw model event data:', data.type);
              
              if (data.type === 'output_text_delta') {
                // Send stream start events if this is the first delta
                if (!hasStarted) {
                  // Send message start event
                  safeEnqueue({
                    type: 'start',
                    messageId: messageId
                  });
                  
                  // Send text block start event
                  safeEnqueue({
                    type: 'text-start',
                    id: textBlockId
                  });
                  
                  hasStarted = true;
                }
                
                // Text delta event - send to UI in Vercel AI SDK format
                accumulatedContent += data.delta;
                console.log('Text delta:', data.delta);
                
                safeEnqueue({
                  type: 'text-delta',
                  id: textBlockId,
                  delta: data.delta
                });
              }
            }
            
            if (event.type === 'run_item_stream_event') {
              console.log('Run item event:', event.item.type);
              
              // Tool calls or other run items
              if (event.item.type === 'function_call' as any) {
                console.log('Function call:', (event.item as any).name);
                safeEnqueue({
                  type: 'tool-call',
                  toolCallId: (event.item as any).callId,
                  toolName: (event.item as any).name,
                  args: JSON.parse((event.item as any).arguments || '{}'),
                });
              }
              
              if (event.item.type === 'function_call_result' as any) {
                console.log('Function call result');
                
                // Check if this is a document action that needs special handling
                let toolResult = (event.item as any).output;
                if (typeof toolResult === 'string') {
                  try {
                    const parsed = JSON.parse(toolResult);
                    if (parsed.action === 'create_document') {
                      // Handle document creation - send the appropriate data stream messages
                      console.log('Handling document creation action:', parsed);
                      
                      // Send document creation data stream messages in the proper format for Vercel AI SDK
                      safeEnqueue({ type: 'data-kind', data: parsed.kind, transient: true });
                      safeEnqueue({ type: 'data-id', data: parsed.id, transient: true });
                      safeEnqueue({ type: 'data-title', data: parsed.title, transient: true });
                      safeEnqueue({ type: 'data-clear', data: null, transient: true });
                      
                 
                    } else if (parsed.action === 'update_document') {
                      // Handle document update - send appropriate update messages
                      console.log('Handling document update action:', parsed);
                      
                   
                    }
                  } catch (parseError) {
                    // Not JSON or not a special action, proceed normally
                  }
                }
                
                safeEnqueue({
                  type: 'tool-result',
                  toolCallId: (event.item as any).callId,
                  result: toolResult,
                });
              }
            }

            if (event.type === 'agent_updated_stream_event') {
              console.log('Agent handoff to:', event.agent.name);
              // DO NOT interfere with stream - this breaks streaming after handoffs
              // We need another approach to communicate agent changes to UI
            }
          }

          console.log('Stream event loop completed');
          
          // Only proceed with completion if controller is still open
          if (!isControllerClosed) {
            console.log('Waiting for final result...');
            
            // Wait for completion and get final output
            try {
              await result.completed;
              console.log('Stream completed successfully');
            } catch (completionError) {
              console.log('Completion error (using accumulated content):', completionError);
            }
            
            // Use accumulated content as the primary source, fallback to finalOutput
            const finalOutput = accumulatedContent || result.finalOutput || '';
            console.log('Final output length:', finalOutput.length);

            // Memory is now handled automatically through conversation history
            console.log('Using conversation history for memory (last 15 messages)');
            
            // Send text block end event if we started streaming
            if (hasStarted && !isControllerClosed) {
              safeEnqueue({
                type: 'text-end',
                id: textBlockId
              });
            }
            
            // Send finish event
            if (!isControllerClosed) {
              safeEnqueue({
                type: 'finish'
              });
            }
            
            // Send final DONE marker with safe enqueue
            if (!isControllerClosed) {
              safeFinalEnqueue(`data: [DONE]\n\n`);
            }
            
            // Save assistant response with the SAME id used for streaming
            // so UI interactions (e.g., voting) reference existing DB rows
            if (finalOutput) {
              await saveMessages({
                messages: [{
                  id: messageId,
                  role: 'assistant',
                  parts: [{ type: 'text', text: finalOutput }],
                  createdAt: new Date(),
                  attachments: [],
                  chatId: id,
                }],
              });
              
              console.log('Messages saved to database');
            }

            console.log('Stream processing completed successfully');
          } else {
            console.log('Controller closed during processing, skipping completion steps');
            
            // Still save the message even if controller is closed
            const finalOutput = accumulatedContent || '';
            if (finalOutput) {
              await saveMessages({
                messages: [{
                  id: messageId,
                  role: 'assistant',
                  parts: [{ type: 'text', text: finalOutput }],
                  createdAt: new Date(),
                  attachments: [],
                  chatId: id,
                }],
              });
              
              console.log('Messages saved to database (controller closed)');
            }
          }
          
          // Safe close
          safeClose();
          
        } catch (error) {
          console.error('OpenAI Agent SDK streaming error:', error);
          
          // Try to save whatever content we have accumulated
          const finalOutput = accumulatedContent || '';
          if (finalOutput) {
            try {
              await saveMessages({
                messages: [{
                  id: messageId,
                  role: 'assistant',
                  parts: [{ type: 'text', text: finalOutput }],
                  createdAt: new Date(),
                  attachments: [],
                  chatId: id,
                }],
              });
              
              console.log('Messages saved to database (error recovery)');
            } catch (saveError) {
              console.error('Failed to save messages during error recovery:', saveError);
            }
          }
          
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