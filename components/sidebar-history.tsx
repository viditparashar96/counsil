'use client';

import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import { useParams, useRouter } from 'next/navigation';
import type { User } from 'next-auth';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import type { Chat } from '@/lib/db/schema';
import { ChatItem } from './sidebar-history-item';
import { LoaderIcon } from './icons';
import { api } from '@/lib/trpc';

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

const PAGE_SIZE = 20;

const groupChatsByDate = (chats: Chat[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as GroupedChats,
  );
};


export function SidebarHistory({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { id } = useParams();
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Use tRPC infinite query for chat history
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    error,
  } = api.history.getChats.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
    },
    {
      getNextPageParam: (lastPage) => {
        // If there are no more pages based on hasMore flag
        if (!lastPage.hasMore) {
          return undefined;
        }
        // Use the last chat's ID as the cursor for the next page
        const lastChat = lastPage.chats.at(-1);
        return lastChat ? { endingBefore: lastChat.id } : undefined;
      },
      enabled: !!user,
      staleTime: 30 * 1000, // 30 seconds
    }
  );

  // Delete chat mutation with optimistic updates
  const deleteChatMutation = api.chat.deleteChat.useMutation({
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await api.history.getChats.cancel();
      
      // Snapshot the previous value
      const previousData = api.history.getChats.getData();
      
      // Optimistically update to remove the chat
      api.history.getChats.setData(
        { limit: PAGE_SIZE },
        (oldData) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              chats: page.chats.filter((chat) => chat.id !== variables.id),
            })),
          };
        }
      );
      
      return { previousData };
    },
    onError: (error, variables, context) => {
      // Revert the optimistic update on error
      if (context?.previousData) {
        api.history.getChats.setData({ limit: PAGE_SIZE }, context.previousData);
      }
      toast.error('Failed to delete chat');
    },
    onSuccess: () => {
      toast.success('Chat deleted successfully');
    },
  });

  const allChats = data?.pages.flatMap((page) => page.chats) ?? [];
  const isLoading = status === 'pending';
  const hasEmptyChatHistory = allChats.length === 0 && !isLoading;

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;

    try {
      await deleteChatMutation.mutateAsync({ id: deleteId });
      
      setShowDeleteDialog(false);
      
      // Navigate to home if deleting the current chat
      if (deleteId === id) {
        router.push('/');
      }
    } catch (error) {
      // Error is already handled by the mutation
    }
  }, [deleteId, deleteChatMutation, id, router]);

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex flex-row gap-2 justify-center items-center px-2 w-full text-sm text-zinc-500">
            Login to save and revisit previous chats!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
          Today
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                key={item}
                className="flex gap-2 items-center px-2 h-8 rounded-md"
              >
                <div
                  className="h-4 rounded-md flex-1 max-w-[--skeleton-width] bg-sidebar-accent-foreground/10"
                  style={
                    {
                      '--skeleton-width': `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex flex-row gap-2 justify-center items-center px-2 w-full text-sm text-zinc-500">
            Your conversations will appear here once you start chatting!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {allChats.length > 0 && (() => {
              const groupedChats = groupChatsByDate(allChats);

              return (
                <div className="flex flex-col gap-6">
                  {groupedChats.today.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                        Today
                      </div>
                      {groupedChats.today.map((chat) => (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={chat.id === id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.yesterday.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                        Yesterday
                      </div>
                      {groupedChats.yesterday.map((chat) => (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={chat.id === id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.lastWeek.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                        Last 7 days
                      </div>
                      {groupedChats.lastWeek.map((chat) => (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={chat.id === id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.lastMonth.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                        Last 30 days
                      </div>
                      {groupedChats.lastMonth.map((chat) => (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={chat.id === id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.older.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                        Older than last month
                      </div>
                      {groupedChats.older.map((chat) => (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={chat.id === id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </SidebarMenu>

          {/* Infinite scroll trigger */}
          <motion.div
            onViewportEnter={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
          />

          {/* Loading and end states */}
          {!hasNextPage ? (
            <div className="flex flex-row gap-2 justify-center items-center px-2 mt-8 w-full text-sm text-zinc-500">
              You have reached the end of your chat history.
            </div>
          ) : isFetchingNextPage ? (
            <div className="flex flex-row gap-2 items-center p-2 mt-8 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div>Loading Chats...</div>
            </div>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
