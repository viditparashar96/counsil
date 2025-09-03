import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../init';
import {
  getDocumentsById,
  saveDocument,
  deleteDocumentsByIdAfterTimestamp,
} from '@/lib/db/queries';

// Define the ArtifactKind type based on what we saw in the API
const artifactKindSchema = z.enum(['text', 'code', 'markdown']);

export const documentRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { id } = input;
      const userId = ctx.session.user.id;

      // Handle special case for 'init' placeholder
      if (id === 'init') {
        return [];
      }

      // Validate UUID for actual document IDs
      const uuidSchema = z.string().uuid();
      const validation = uuidSchema.safeParse(id);
      
      if (!validation.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid document ID format',
        });
      }

      const documents = await getDocumentsById({ id });
      const [document] = documents;

      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      if (document.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this document',
        });
      }

      return documents;
    }),

  save: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string(),
        title: z.string().min(1).max(255),
        kind: artifactKindSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, content, title, kind } = input;
      const userId = ctx.session.user.id;

      const documents = await getDocumentsById({ id });

      if (documents.length > 0) {
        const [document] = documents;

        if (document.userId !== userId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to modify this document',
          });
        }
      }

      const document = await saveDocument({
        id,
        content,
        title,
        kind: kind as any, // Cast to match the existing type
        userId,
      });

      return document;
    }),

  deleteAfterTimestamp: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        timestamp: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, timestamp } = input;
      const userId = ctx.session.user.id;

      const documents = await getDocumentsById({ id });
      const [document] = documents;

      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      if (document.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this document',
        });
      }

      const documentsDeleted = await deleteDocumentsByIdAfterTimestamp({
        id,
        timestamp: new Date(timestamp),
      });

      return documentsDeleted;
    }),
});