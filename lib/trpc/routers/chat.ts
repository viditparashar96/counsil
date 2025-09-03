import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../init';

// Note: For streaming chat functionality, we'll keep the existing REST API route
// at /api/chat as it's optimized for streaming with Vercel AI SDK.
// The tRPC implementation here provides type-safe alternatives for simpler operations.

export const chatRouter = createTRPCRouter({
  getChat: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { id } = input;
      const userId = ctx.session.user.id;

      const { getChatById } = await import('@/lib/db/queries');
      const chat = await getChatById({ id });

      if (!chat) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chat not found',
        });
      }

      if (chat.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this chat',
        });
      }

      return chat;
    }),

  deleteChat: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id } = input;
      const userId = ctx.session.user.id;

      const { getChatById, deleteChatById } = await import('@/lib/db/queries');
      const chat = await getChatById({ id });

      if (!chat) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chat not found',
        });
      }

      if (chat.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this chat',
        });
      }

      const deletedChat = await deleteChatById({ id });
      return deletedChat;
    }),
});