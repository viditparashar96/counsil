import { tool } from '@openai/agents';
import { z } from 'zod';
import type { Session } from 'next-auth';
import OpenAI from 'openai';

// Weather tool for OpenAI Agent SDK
export const getWeatherTool = tool({
  name: 'get_weather',
  description: 'Get current weather information for a specific location',
  parameters: z.object({
    location: z.string().describe('The location to get weather for'),
  }),
  execute: async ({ location }: { location: string }) => {
    // Dynamic import to avoid server-only bundling
    const { getWeather } = await import('./get-weather');
    const weatherTool = getWeather;
    
    // Execute the original tool logic with proper typing
    if (!weatherTool.execute) {
      throw new Error('Weather tool execute function not found');
    }
    
    const result = await weatherTool.execute({ location }, {} as any);
    return result;
  },
});

// Document creation tool for OpenAI Agent SDK
export function createDocumentTool({ session }: { session: Session }) {
  return tool({
    name: 'create_document',
    description: 'Create a new document with specified content and metadata',
    parameters: z.object({
      title: z.string().describe('The title of the document'),
      kind: z.enum(['text', 'code', 'markdown']).describe('The type of document to create'),
    }),
    execute: async ({ title, kind }: { title: string; kind: 'text' | 'code' | 'markdown' }) => {
      try {
        // We need to return a special format that tells the frontend to create a document
        // This will be caught by the streaming handler and converted to the appropriate data stream messages
        return {
          action: 'create_document',
          title,
          kind,
          id: crypto.randomUUID(),
          success: true,
          message: `Creating ${kind} document: "${title}"`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to create document',
        };
      }
    },
  });
}

// Document update tool for OpenAI Agent SDK
export function updateDocumentTool({ session }: { session: Session }) {
  return tool({
    name: 'update_document',
    description: 'Update an existing document with new content',
    parameters: z.object({
      documentId: z.string().describe('The ID of the document to update'),
      content: z.string().describe('The new content for the document'),
      title: z.string().nullable().describe('New title for the document (null if not changing title)'),
    }),
    execute: async ({ documentId, content, title }: { documentId: string; content: string; title: string | null }) => {
      try {
        // Return a special format that tells the frontend to update a document
        return {
          action: 'update_document',
          documentId,
          content,
          title,
          success: true,
          message: `Updating document${title ? ` with new title: "${title}"` : ''}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to update document',
        };
      }
    },
  });
}

// Suggestions request tool for OpenAI Agent SDK
export function requestSuggestionsTool({ session }: { session: Session }) {
  return tool({
    name: 'request_suggestions',
    description: 'Request suggestions for improving or continuing content',
    parameters: z.object({
      documentId: z.string().describe('The ID of the document to get suggestions for'),
      currentContent: z.string().describe('The current content to generate suggestions for'),
      requestType: z.enum(['improve', 'continue', 'alternatives']).describe('Type of suggestions requested'),
    }),
    execute: async ({ documentId, currentContent, requestType }: { documentId: string; currentContent: string; requestType: 'improve' | 'continue' | 'alternatives' }) => {
      try {
        // Dynamic import
        const { requestSuggestions } = await import('./request-suggestions');
        const suggestionsTool = requestSuggestions({ 
          session, 
          dataStream: {
            writeData: () => {}, // Mock data stream for now
          } as any 
        });
        
        if (!suggestionsTool.execute) {
          throw new Error('Suggestions tool execute function not found');
        }
        
        const result = await suggestionsTool.execute({ 
          documentId, 
          currentContent,
          requestType 
        }, {} as any);
        
        // Handle the result properly based on its type
        if (typeof result === 'object' && result !== null && 'suggestions' in result) {
          return {
            success: true,
            suggestions: (result as any).suggestions,
            message: `Generated ${requestType} suggestions for the document`,
          };
        } else {
          return {
            success: true,
            suggestions: result,
            message: `Generated ${requestType} suggestions for the document`,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to generate suggestions',
        };
      }
    },
  });
}

// Career counseling tool for OpenAI Agent SDK
export function careerCounselingTool({ session, chatId }: { session: Session; chatId: string }) {
  return tool({
    name: 'career_counseling',
    description: `Route career-related questions to specialized AI agents. Use this tool when users ask about:
- Resume writing, optimization, or review
- Interview preparation and practice
- Career planning and transitions
- Job search strategies and networking
- Professional development`,
    parameters: z.object({
      query: z.string().describe('The career-related question or request from the user'),
      context: z.string().nullable().describe('Additional context about the user\'s situation (null if no context)'),
      preferredAgent: z.enum(['resume', 'interview', 'planner', 'jobsearch']).nullable().describe('Specific agent to use if known (null for auto-selection)'),
    }),
    execute: async ({ query, context, preferredAgent }: { query: string; context: string | null; preferredAgent: 'resume' | 'interview' | 'planner' | 'jobsearch' | null }) => {
      try {
        // Dynamic import to avoid server-only bundling issues
        const { CareerCounselingRouter } = await import('@/lib/agents/router');
        const router = new CareerCounselingRouter();

        // Route the message through the career counseling system
        const result = await router.routeMessage(query, {
          userId: session.user.id,
          chatId,
          currentAgent: preferredAgent || undefined,
          conversationHistory: [],
        });

        // Format response for the main agent
        const agentName = result.agentUsed === 'resume' ? 'Resume Expert' 
          : result.agentUsed === 'interview' ? 'Interview Coach'
          : result.agentUsed === 'planner' ? 'Career Planner' 
          : 'Job Search Advisor';

        let responseMessage = `**${agentName} Response:**\n\n${result.response}`;

        if (result.handoffMessage && result.suggestedAgent) {
          responseMessage += `\n\n---\n\n💡 **Suggestion:** ${result.handoffMessage}`;
        }

        return {
          response: responseMessage,
          agentUsed: result.agentUsed,
          suggestedAgent: result.suggestedAgent,
          handoffMessage: result.handoffMessage,
        };
      } catch (error) {
        console.error('Career counseling tool error:', error);
        
        return {
          response: `I encountered an issue connecting with our career counseling specialists. Let me help you directly with your career question: ${query}. 

For comprehensive career guidance, our platform includes specialized agents for:
- **Resume Expert**: Resume writing, optimization, and ATS compliance
- **Interview Coach**: Interview preparation and behavioral question practice  
- **Career Planner**: Long-term career strategy and skill development
- **Job Search Advisor**: Job market navigation and networking strategies

How can I assist you with your career goals today?`,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}

// File analysis tool for OpenAI Agent SDK to handle images, PDFs, and documents
export function createFileAnalysisTool() {
  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return tool({
    name: 'analyze_file',
    description: 'Analyze files (images, PDFs, documents) that users have uploaded to extract content, answer questions, or perform specific analysis tasks',
    parameters: z.object({
      fileUrl: z.string().describe('The URL of the file to analyze (image, PDF, or document)'),
      fileName: z.string().nullable().describe('The original filename to help determine file type (null if not provided)'),
      mediaType: z.string().nullable().describe('The media type/MIME type of the file (null if not provided)'),
      query: z.string().describe('What specific information to extract or question to answer about the file'),
      analysisType: z.enum(['general', 'text_extraction', 'document_analysis', 'resume_review', 'pdf_analysis']).default('general').describe('The type of analysis to perform'),
    }),
    execute: async ({ fileUrl, fileName, mediaType, query, analysisType }: { 
      fileUrl: string; 
      fileName: string | null; 
      mediaType: string | null; 
      query: string; 
      analysisType: 'general' | 'text_extraction' | 'document_analysis' | 'resume_review' | 'pdf_analysis' 
    }) => {
      try {
        // Validate the file URL
        if (!fileUrl || typeof fileUrl !== 'string') {
          throw new Error('Invalid or missing file URL');
        }

        // Log for debugging
        console.log('File Analysis Tool - URL received:', fileUrl);
        console.log('File Analysis Tool - File name:', fileName);
        console.log('File Analysis Tool - Media type:', mediaType);
        console.log('File Analysis Tool - Query:', query);
        console.log('File Analysis Tool - Analysis Type:', analysisType);

        // Determine file type
        const isImage = mediaType?.startsWith('image/') || 
                       fileName?.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i);
        const isPDF = mediaType === 'application/pdf' || 
                     fileName?.endsWith('.pdf');
        const isDocx = mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                      fileName?.endsWith('.docx');

        // Validate URL format
        let validUrl: string;
        try {
          // Try to create URL object to validate
          new URL(fileUrl);
          validUrl = fileUrl;
        } catch (urlError) {
          // If it's not a valid URL, check if it's a data URL or needs protocol
          if (fileUrl.startsWith('data:')) {
            validUrl = fileUrl;
          } else if (fileUrl.startsWith('//')) {
            validUrl = `https:${fileUrl}`;
          } else if (!fileUrl.startsWith('http')) {
            validUrl = `https://${fileUrl}`;
          } else {
            throw new Error(`Invalid file URL format: ${fileUrl}`);
          }
        }

        // Set up system prompt based on file type and analysis type
        let systemPrompt = 'You are a helpful assistant that can analyze files and provide detailed information about them.';
        
        if (isPDF) {
          switch (analysisType) {
            case 'text_extraction':
              systemPrompt = 'You are an expert at extracting and transcribing text from PDF documents. Provide accurate, complete text extraction while preserving structure.';
              break;
            case 'document_analysis':
              systemPrompt = 'You are an expert at analyzing PDF documents. Focus on structure, content, key information, and document layout.';
              break;
            case 'resume_review':
              systemPrompt = 'You are a professional resume reviewer. Analyze the resume in this PDF and provide detailed feedback on formatting, content, and suggestions for improvement.';
              break;
            case 'pdf_analysis':
              systemPrompt = 'You are an expert at comprehensive PDF analysis. Extract key information, analyze structure, and provide insights about the document content.';
              break;
            default:
              systemPrompt = 'You are an expert at analyzing PDF documents. Provide comprehensive analysis of the content, structure, and key information.';
          }
        } else if (isImage) {
          switch (analysisType) {
            case 'text_extraction':
              systemPrompt = 'You are an expert at extracting and transcribing text from images. Provide accurate, complete text extraction.';
              break;
            case 'document_analysis':
              systemPrompt = 'You are an expert at analyzing documents in images. Focus on structure, content, and key information.';
              break;
            case 'resume_review':
              systemPrompt = 'You are a professional resume reviewer. Analyze the resume in the image and provide detailed feedback on formatting, content, and suggestions for improvement.';
              break;
            default:
              systemPrompt = 'You are an expert at analyzing images and visual content. Provide detailed information about what you see.';
          }
        } else {
          systemPrompt = 'You are an expert at analyzing various file types. Provide detailed analysis based on the file content and user query.';
        }

        // Prepare the API call based on file type
        let response;
        
        if (isPDF) {
          // For PDFs, we need to fetch the file and convert to base64 since URLs aren't supported
          // Fetch the PDF file
          const pdfResponse = await fetch(validUrl);
          if (!pdfResponse.ok) {
            throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
          }
          
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const base64Data = Buffer.from(pdfBuffer).toString('base64');
          
          // For PDFs, use the new direct PDF support in GPT-4o with base64 data
          response = await openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: query
                  },
                  {
                    type: 'file' as any,
                    file: {
                      file_data: `data:application/pdf;base64,${base64Data}`,
                      filename: fileName || 'document.pdf'
                    }
                  }
                ]
              }
            ],
            max_tokens: 2000,
          });
        } else if (isImage) {
          // For images, use the vision capabilities
          response = await openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: query
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: validUrl
                    }
                  }
                ]
              }
            ],
            max_tokens: 2000,
          });
        } else if (isDocx) {
          // For DOCX files, we'll need to inform the user about limitations
          throw new Error('DOCX files are not directly supported via the API yet. Please convert to PDF or extract text first.');
        } else {
          // For other file types, attempt text-based analysis
          response = await openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: `${query}\n\nFile URL: ${validUrl}\nFile Type: ${mediaType || 'Unknown'}\nFilename: ${fileName || 'Unknown'}`
              }
            ],
            max_tokens: 2000,
          });
        }

        const analysisResult = response.choices[0]?.message?.content || 'I was unable to analyze the file.';

        // Determine file type for response message
        let fileType = 'file';
        if (isPDF) fileType = 'PDF';
        else if (isImage) fileType = 'image';
        else if (isDocx) fileType = 'Word document';

        return {
          success: true,
          analysis: analysisResult,
          analysisType,
          fileType,
          message: `${fileType} Analysis (${analysisType}): ${analysisResult}`,
        };
      } catch (error) {
        console.error('File analysis tool error:', error);
        
        // Provide specific error messages based on the error type
        let errorMessage = 'I encountered an error analyzing the file.';
        
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('invalid_image_url') || errorMsg.includes('invalid_pdf_url')) {
          errorMessage = 'The file URL appears to be invalid or inaccessible. Please check that the file is publicly accessible and try uploading it again.';
        } else if (errorMsg.includes('Invalid file URL format')) {
          errorMessage = 'The file URL format is not supported. Please ensure you\'re uploading a valid file.';
        } else if (errorMsg.includes('Invalid or missing file URL')) {
          errorMessage = 'No valid file URL was found in your message. Please try uploading the file again.';
        } else if (errorMsg.includes('DOCX files are not directly supported')) {
          errorMessage = 'DOCX files are not directly supported via the API yet. Please convert your Word document to PDF format for analysis.';
        }
        
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `${errorMessage} Error details: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });
}