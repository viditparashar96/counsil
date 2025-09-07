'use client';

import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';
import { ChatHeader } from '@/components/chat-header';
import { fetchWithErrorHandlers, generateUUID, cn } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { ChatSDKError } from '@/lib/errors';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { api } from '@/lib/trpc';
import { useAgentHandoffs } from '@/hooks/use-agent-handoffs';
import { AgentHandoffBanner } from './agent-handoff-banner';
import { mutate } from 'swr';
// Removed: explicit top loader chip; we use gradient bar as the loader now

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { setDataStream } = useDataStream();
  const utils = api.useUtils();
  
  const {
    handoffState,
    handleHandoff,
    dismissHandoff,
    processAgentResponse,
    detectAgentFromMessage,
    isHandoffLoading,
  } = useAgentHandoffs(id);

  const [input, setInput] = useState<string>('');

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            message: messages.at(-1),
            selectedChatModel: initialChatModel,
            selectedVisibilityType: visibilityType,
            ...body,
          },
        };
      },
    }),
    onData: (dataPart:any) => {

      console.log('dataPart', dataPart);
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
      
      // Process agent responses for handoff suggestions
      if (dataPart.type === 'data') {
        processAgentResponse(dataPart.data);
      }
      
      // Detect agent changes from message content (non-intrusive approach)
      if (dataPart.type === 'text-delta' && dataPart.delta) {
        detectAgentFromMessage(dataPart.delta);
      }
    },
    onFinish: () => {
      // Invalidate tRPC chat history to show the new message
      utils.history.getChats.invalidate();
      // Invalidate chat messages to ensure fresh data
      utils.chat.getMessages.invalidate({ chatId: id });
      
      // Immediately invalidate SWR cache for sidebar history
      // Target the first page specifically since new chats appear at the top
      mutate(`/api/history?limit=20`, undefined, { revalidate: true });
      // Clear other history pages cache (they'll refetch if accessed)
      mutate(
        key => typeof key === 'string' && key.includes('/api/history') && key !== `/api/history?limit=20`,
        undefined,
        { revalidate: false }
      );
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: 'user' as const,
        parts: [{ type: 'text', text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  // Use tRPC query for votes data with proper caching and type safety
  const { data: votes } = api.vote.getVotes.useQuery(
    { chatId: id },
    {
      enabled: messages.length >= 2,
      staleTime: 10 * 1000, // 10 seconds
      refetchOnWindowFocus: false,
    }
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  // Force sidebar refresh when this chat component mounts
  // This ensures new chats appear immediately in the sidebar
  useEffect(() => {
    // Small delay to ensure the chat has been saved to the database
    const timeoutId = setTimeout(() => {
      // More specific invalidation - target the first page which is where new chats appear
      mutate(`/api/history?limit=20`, undefined, { revalidate: true });
      // Also invalidate any other history pages
      mutate(
        key => typeof key === 'string' && key.includes('/api/history'),
        undefined,
        { revalidate: false } // Don't revalidate all pages, just clear them
      );
    }, 500); // Reduced delay for faster updates

    return () => clearTimeout(timeoutId);
  }, [id]); // Re-run when chat ID changes


  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />

        {/* Agent Indicator - shows current agent */}
    
        {/* Content area gets a Gemini-style gradient bar at the very top */}
        <div
          className={cn(
            'relative ai-top-shadow flex-1 flex flex-col',
            (status === 'submitted' || status === 'streaming') && 'ai-gradient-top',
          )}
        >
          {messages.length === 0 ? (
            // New chat: center greeting and input vertically
            <div className="flex-1 flex items-center">
              <div className="mx-auto w-full md:max-w-3xl px-4 flex flex-col gap-6">
                <div>
                  {/* Centered welcome UI */}
                  <Messages
                    chatId={id}
                    status={status}
                    votes={votes}
                    messages={messages}
                    setMessages={setMessages}
                    regenerate={regenerate}
                    isReadonly={isReadonly}
                  />
                </div>
                {!isReadonly && (
                  <MultimodalInput
                    chatId={id}
                    input={input}
                    setInput={setInput}
                    status={status}
                    stop={stop}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    messages={messages}
                    setMessages={setMessages}
                    sendMessage={sendMessage}
                    selectedVisibilityType={visibilityType}
                    selectedModelId={initialChatModel}
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              <Messages
                chatId={id}
                status={status}
                votes={votes}
                messages={messages}
                setMessages={setMessages}
                regenerate={regenerate}
                isReadonly={isReadonly}
              />

              {/* Agent Handoff Banner */}
              {handoffState.isHandoffAvailable && handoffState.suggestedAgent && handoffState.handoffMessage && (
                <AgentHandoffBanner
                  suggestedAgent={handoffState.suggestedAgent}
                  handoffMessage={handoffState.handoffMessage}
                  onHandoff={handleHandoff}
                  onDismiss={dismissHandoff}
                  isLoading={isHandoffLoading}
                />
              )}

              <div className="sticky bottom-0 flex gap-2 px-4 pb-4 mx-auto w-full bg-background md:pb-6 md:max-w-3xl z-[1] border-t-0">
                {!isReadonly && (
                  <MultimodalInput
                    chatId={id}
                    input={input}
                    setInput={setInput}
                    status={status}
                    stop={stop}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    messages={messages}
                    setMessages={setMessages}
                    sendMessage={sendMessage}
                    selectedVisibilityType={visibilityType}
                    selectedModelId={initialChatModel}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

    </>
  );
}
