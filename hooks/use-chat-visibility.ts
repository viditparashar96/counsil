'use client';

import { useMemo } from 'react';
import { updateChatVisibility } from '@/app/(chat)/actions';
import type { VisibilityType } from '@/components/visibility-selector';
import { api } from '@/lib/trpc';

export function useChatVisibility({
  chatId,
  initialVisibilityType,
}: {
  chatId: string;
  initialVisibilityType: VisibilityType;
}) {
  const utils = api.useUtils();
  
  // Get chat history data to check current visibility
  const { data } = api.history.getChats.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined;
        const lastChat = lastPage.chats.at(-1);
        return lastChat ? { endingBefore: lastChat.id } : undefined;
      },
      staleTime: 30 * 1000, // 30 seconds
    }
  );

  const visibilityType = useMemo(() => {
    if (!data?.pages) return initialVisibilityType;
    
    // Find the chat in all pages
    for (const page of data.pages) {
      const chat = page.chats.find((chat) => chat.id === chatId);
      if (chat) {
        return chat.visibility;
      }
    }
    
    return 'private'; // Default if chat not found
  }, [data, chatId, initialVisibilityType]);

  const setVisibilityType = async (updatedVisibilityType: VisibilityType) => {
    // Invalidate chat history to refetch with updated visibility
    await utils.history.getChats.invalidate();

    // Update the visibility on the server
    await updateChatVisibility({
      chatId: chatId,
      visibility: updatedVisibilityType,
    });
  };

  return { visibilityType, setVisibilityType };
}
