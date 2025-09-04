import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { uploadFileToAzure } from '@/lib/storage/azure';
import { createTRPCRouter, protectedProcedure } from '../init';

// File validation schema
const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum([
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'image/bmp', 
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/msword' // DOC (legacy)
  ]),
  size: z.number().max(10 * 1024 * 1024), // 10MB limit for documents
  data: z.string(), // base64 encoded file data
});

export const uploadRouter = createTRPCRouter({
  uploadFile: protectedProcedure
    .input(fileUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const { filename, contentType, size, data } = input;

      try {
        // Decode base64 data
        const fileBuffer = Buffer.from(data, 'base64');
        
        // Verify the actual size matches
        if (fileBuffer.length !== size) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'File size mismatch',
          });
        }

        // Upload to Azure Blob Storage
        const uploadResult = await uploadFileToAzure(fileBuffer, filename, {
          contentType,
        });

        return {
          url: uploadResult.url,
          downloadUrl: uploadResult.downloadUrl,
          pathname: uploadResult.pathname,
          size: size, // Use the input size since uploadResult.size might not exist
        };
      } catch (error) {
        console.error('Upload error:', error);
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upload file',
        });
      }
    }),
});