import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uploadFileToAzure } from '@/lib/storage/azure';
import { auth } from '@/app/(auth)/auth';

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB',
    })
    // Support images, PDFs, and Word documents
    .refine((file) => [
      'image/jpeg', 
      'image/png', 
      'image/gif', 
      'image/bmp', 
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/msword' // DOC (legacy)
    ].includes(file.type), {
      message: 'File type should be JPEG, PNG, GIF, BMP, WebP, PDF, or Word document',
    }),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData since Blob doesn't have name property
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();

    try {
      // Get file type from the File object for better content type detection
      const contentType = (formData.get('file') as File).type || 'application/octet-stream';
      
      const data = await uploadFileToAzure(fileBuffer, filename, {
        contentType,
      });

      return NextResponse.json(data);
    } catch (error) {
      console.error('Azure Blob Storage upload error:', error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
