import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../init';

export const voteRouter = createTRPCRouter({
  getVotes: protectedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { chatId } = input;
      const userId = ctx.session.user.id;

      const { getChatById, getVotesByChatId } = await import('@/lib/db/queries');
      const chat = await getChatById({ id: chatId });

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

      const votes = await getVotesByChatId({ id: chatId });
      return votes;
    }),

  voteMessage: protectedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        messageId: z.string().uuid(),
        type: z.enum(['up', 'down']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { chatId, messageId, type } = input;
      const userId = ctx.session.user.id;

      const { getChatById, voteMessage: voteMessageDb } = await import('@/lib/db/queries');
      const chat = await getChatById({ id: chatId });

      if (!chat) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chat not found',
        });
      }

      if (chat.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to vote on this chat',
        });
      }

      await voteMessageDb({
        chatId,
        messageId,
        type,
      });

      return { success: true, message: 'Message voted successfully' };
    }),
});
