import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../init';

export const historyRouter = createTRPCRouter({
  getChats: protectedProcedure
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