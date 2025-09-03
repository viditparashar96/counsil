import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../init';

export const historyRouter = createTRPCRouter({
  getChats: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        userId: z.string().optional(),
        // Support legacy direction parameter for backward compatibility
        direction: z.enum(['forward', 'backward']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, userId } = input;
      
      // Use the provided userId or fall back to session user
      const targetUserId = userId || ctx.session.user.id;
      
      // Dynamic import to avoid client-side bundling
      const { getChatsByUserId } = await import('@/lib/db/queries');
      
      const result = await getChatsByUserId({
        id: targetUserId,
        limit: limit + 1, // Fetch one extra to check if there are more
        startingAfter: null,
        endingBefore: cursor || null,
      });

      // Separate the actual chats from the cursor check
      const hasNextPage = result.length > limit;
      const chats = hasNextPage ? result.slice(0, -1) : result;
      const nextCursor = hasNextPage ? chats[chats.length - 1]?.id : undefined;

      return {
        chats,
        nextCursor,
        hasNextPage,
        totalCount: chats.length,
      };
    }),
    
  // Legacy endpoint for backward compatibility
  getChatsLegacy: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        startingAfter: z.string().optional(),
        endingBefore: z.string().optional(),
      }).refine(
        (data) => !(data.startingAfter && data.endingBefore),
        {
          message: 'Only one of startingAfter or endingBefore can be provided',
          path: ['startingAfter', 'endingBefore'],
        }
      )
    )
    .query(async ({ ctx, input }) => {
      const { limit, startingAfter, endingBefore } = input;
      
      // Dynamic import to avoid client-side bundling
      const { getChatsByUserId } = await import('@/lib/db/queries');
      
      const chats = await getChatsByUserId({
        id: ctx.session.user.id,
        limit,
        startingAfter: startingAfter || null,
        endingBefore: endingBefore || null,
      });

      return chats;
    }),
});