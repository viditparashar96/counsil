'use client';

import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetchWithErrorHandlers, generateUUID, cn } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { api } from '@/lib/trpc';
import { useAgentHandoffs } from '@/hooks/use-agent-handoffs';
import { AgentHandoffBanner } from './agent-handoff-banner';
import { AgentIndicator } from './agent-indicator';
// Removed: explicit top loader chip; we use gradient bar as the loader now

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
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
    updateCurrentAgent,
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
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
      
      // Process agent responses for handoff suggestions
      if (dataPart.type === 'data') {
        processAgentResponse(dataPart.data);
        
        // Handle agent handoffs for UI updates
        if (dataPart.data?.type === 'agent-handoff' && dataPart.data.agentName) {
          updateCurrentAgent(dataPart.data.agentName);
        }
      }
    },
    onFinish: () => {
      // Invalidate chat history to show the new message
      utils.history.getChats.invalidate();
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
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

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
        <AgentIndicator
          currentAgent={handoffState.currentAgent}
          isTransitioning={handoffState.isTransitioning}
          transitionMessage={handoffState.transitionMessage}
        />

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
                    isArtifactVisible={isArtifactVisible}
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
                isArtifactVisible={isArtifactVisible}
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

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        sendMessage={sendMessage}
        messages={messages}
        setMessages={setMessages}
        regenerate={regenerate}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
        selectedModelId={initialChatModel}
      />
    </>
  );
}
