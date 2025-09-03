'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/trpc';

export interface ChatHistoryParams {
  limit?: number;
  userId?: string;
}

export interface ChatHistoryPage {
  chats: Array<{
    id: string;
    title: string;
    createdAt: Date;
    userId: string;
    visibility: string;
    messageCount?: number;
  }>;
  nextCursor?: string;
  hasNextPage: boolean;
}

/**
 * Production-ready infinite query for chat history with optimizations
 */
export function useChatHistoryInfinite({
  limit = 20,
  userId,
}: ChatHistoryParams = {}) {
  const utils = api.useUtils();

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['chats', 'infinite', { userId, limit }],
    queryFn: async ({ pageParam }) => {
      // Use tRPC to fetch chat history with pagination
      const result = await utils.history.getChats.fetch({
        cursor: pageParam as string | undefined,
        limit,
        userId,
      });

      return {
        chats: result.chats || [],
        nextCursor: result.nextCursor,
        hasNextPage: result.hasNextPage,
      } as ChatHistoryPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      return lastPage.hasNextPage ? lastPage.nextCursor : undefined;
    },
    getPreviousPageParam: (firstPage) => {
      // For bi-directional scrolling if needed in the future
      return undefined;
    },
    // Production optimizations
    staleTime: 2 * 60 * 1000, // 2 minutes - chat history doesn't change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes cache retention
    maxPages: 10, // Limit to 10 pages (200 chats max) for memory efficiency
    // Refetch settings
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: false, // Only refetch if stale
    // Error retry settings
    retry: (failureCount, error) => {
      // Don't retry client errors
      if (error?.status >= 400 && error?.status < 500) return false;
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  // Flatten all pages into a single array for easy rendering
  const allChats = infiniteQuery.data?.pages.flatMap((page) => page.chats) || [];

  // Optimistic update helpers
  const addOptimisticChat = (newChat: {
    id: string;
    title: string;
    createdAt: Date;
    userId: string;
    visibility: string;
  }) => {
    utils.history.getChats.setInfiniteData(
      ['chats', 'infinite', { userId, limit }],
      (oldData) => {
        if (!oldData) return oldData;

        // Add to the first page
        const updatedPages = [...oldData.pages];
        if (updatedPages[0]) {
          updatedPages[0] = {
            ...updatedPages[0],
            chats: [newChat, ...updatedPages[0].chats],
          };
        }

        return {
          ...oldData,
          pages: updatedPages,
        };
      }
    );
  };

  const removeOptimisticChat = (chatId: string) => {
    utils.history.getChats.setInfiniteData(
      ['chats', 'infinite', { userId, limit }],
      (oldData) => {
        if (!oldData) return oldData;

        const updatedPages = oldData.pages.map((page) => ({
          ...page,
          chats: page.chats.filter((chat) => chat.id !== chatId),
        }));

        return {
          ...oldData,
          pages: updatedPages,
        };
      }
    );
  };

  const updateOptimisticChat = (
    chatId: string,
    updates: Partial<{
      title: string;
      visibility: string;
    }>
  ) => {
    utils.history.getChats.setInfiniteData(
      ['chats', 'infinite', { userId, limit }],
      (oldData) => {
        if (!oldData) return oldData;

        const updatedPages = oldData.pages.map((page) => ({
          ...page,
          chats: page.chats.map((chat) =>
            chat.id === chatId ? { ...chat, ...updates } : chat
          ),
        }));

        return {
          ...oldData,
          pages: updatedPages,
        };
      }
    );
  };

  // Prefetch next page for better UX
  const prefetchNextPage = () => {
    if (infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) {
      infiniteQuery.fetchNextPage();
    }
  };

  return {
    // Query state
    ...infiniteQuery,
    // Flattened data
    allChats,
    totalChats: allChats.length,
    // Optimistic updates
    addOptimisticChat,
    removeOptimisticChat,
    updateOptimisticChat,
    // Performance helpers
    prefetchNextPage,
    // Loading states
    isInitialLoading: infiniteQuery.isLoading && !infiniteQuery.data,
    isLoadingMore: infiniteQuery.isFetchingNextPage,
    isEmpty: allChats.length === 0 && !infiniteQuery.isLoading,
  };
}