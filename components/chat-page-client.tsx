'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Chat } from '@/components/chat';
import { api } from '@/lib/trpc';
import { convertToUIMessages } from '@/lib/utils';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { getCookie } from 'cookies-next';
import type { Session } from 'next-auth';

interface ChatPageClientProps {
  id: string;
  session: Session;
}

export function ChatPageClient({ id, session }: ChatPageClientProps) {
  const router = useRouter();

  // Fetch chat data with tRPC
  const { 
    data: chat, 
    isLoading: chatLoading, 
    error: chatError 
  } = api.chat.getChat.useQuery(
    { id },
    {
      retry: 1,
      staleTime: 30 * 1000, // Consider data fresh for 30 seconds
      refetchOnWindowFocus: false,
    }
  );

  // Fetch messages with tRPC
  const { 
    data: messagesFromDb, 
    isLoading: messagesLoading, 
    error: messagesError 
  } = api.chat.getMessages.useQuery(
    { chatId: id },
    {
      enabled: !!chat, // Only fetch messages if chat exists
      retry: 1,
      staleTime: 10 * 1000, // Messages can be fresher
      refetchOnWindowFocus: false,
    }
  );

  // Get chat model from cookie
  const chatModelFromCookie = getCookie('chat-model') as string | undefined;

  // Convert messages to UI format
  const uiMessages = useMemo(() => {
    if (!messagesFromDb) return [];
    return convertToUIMessages(messagesFromDb);
  }, [messagesFromDb]);

  // Handle loading states
  if (chatLoading || messagesLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Chat header skeleton */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="h-6 bg-muted animate-pulse rounded w-32"></div>
          <div className="h-8 bg-muted animate-pulse rounded w-8"></div>
        </div>
        
        {/* Chat content skeleton */}
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      </div>
    );
  }

  // Handle errors
  if (chatError) {
    if (chatError.data?.code === 'NOT_FOUND') {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-muted-foreground">404</h1>
            <h2 className="text-xl font-semibold">Chat Not Found</h2>
            <p className="text-muted-foreground">
              The chat you&apos;re looking for doesn&apos;t exist or may have been deleted.
            </p>
            <button 
              onClick={() => router.push('/')}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }
    if (chatError.data?.code === 'FORBIDDEN') {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-muted-foreground">403</h1>
            <h2 className="text-xl font-semibold">Access Forbidden</h2>
            <p className="text-muted-foreground">
              You don&apos;t have permission to access this private chat.
            </p>
            <button 
              onClick={() => router.push('/')}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <p className="text-destructive">Failed to load chat</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (messagesError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <p className="text-destructive">Failed to load messages</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    );
  }

  return (
    <Chat
      id={chat.id}
      initialMessages={uiMessages}
      initialChatModel={chatModelFromCookie || DEFAULT_CHAT_MODEL}
      initialVisibilityType={chat.visibility}
      isReadonly={session?.user?.id !== chat.userId}
      session={session}
    />
  );
}