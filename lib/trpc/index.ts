/**
 * Client-only tRPC exports
 * Import this in Client Components to access tRPC functionality
 */

// Export the main API client for React usage
export { api } from './react';

// Export types for type inference only (erased at build time)
export type { AppRouter } from './routers/_app';

// Re-export commonly used TanStack Query utilities
export {
  useQueryClient,
  useIsMutating,
  useIsFetching,
} from '@tanstack/react-query';

/**
 * Usage examples:
 *
 * import { api } from '@/lib/trpc';
 * 
 * // Queries
 * const { data, isLoading } = api.history.getChats.useQuery({ limit: 20 });
 * 
 * // Mutations
 * const deleteChat = api.chat.deleteChat.useMutation({
 *   onSuccess: () => {
 *     toast.success('Chat deleted successfully');
 *   },
 * });
 * 
 * // Infinite queries
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 * } = api.history.getChats.useInfiniteQuery(
 *   { limit: 20 },
 *   {
 *     getNextPageParam: (lastPage) => lastPage.nextCursor,
 *   }
 * );
 */
