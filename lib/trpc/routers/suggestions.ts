import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../init';
import { getSuggestionsByDocumentId } from '@/lib/db/queries';

export const suggestionsRouter = createTRPCRouter({
  getByDocumentId: protectedProcedure
    .input(
      z.object({
        documentId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { documentId } = input;
      const userId = ctx.session.user.id;

      const suggestions = await getSuggestionsByDocumentId({
        documentId,
      });

      if (suggestions.length === 0) {
        return [];
      }

      const [suggestion] = suggestions;

      if (suggestion.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to access these suggestions',
        });
      }

      return suggestions;
    }),
});