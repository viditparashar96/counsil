import { tool } from '@openai/agents';
import { z } from 'zod';
import type { Session } from 'next-auth';

// Weather tool for OpenAI Agent SDK
export const getWeatherTool = tool({
  description: 'Get current weather information for a specific location',
  parameters: z.object({
    location: z.string().describe('The location to get weather for'),
  }),
  execute: async ({ location }) => {
    // Dynamic import to avoid server-only bundling
    const { getWeather } = await import('./get-weather');
    const weatherTool = getWeather;
    
    // Execute the original tool logic
    const result = await weatherTool.execute({ location });
    return result;
  },
});

// Document creation tool for OpenAI Agent SDK
export function createDocumentTool({ session }: { session: Session }) {
  return tool({
    description: 'Create a new document with specified content and metadata',
    parameters: z.object({
      title: z.string().describe('The title of the document'),
      content: z.string().describe('The content of the document'),
      kind: z.enum(['text', 'code', 'markdown']).describe('The type of document to create'),
    }),
    execute: async ({ title, content, kind }) => {
      try {
        // Dynamic import
        const { createDocument } = await import('./create-document');
        const documentTool = createDocument({ 
          session, 
          dataStream: {
            writeData: () => {}, // Mock data stream for now
          } as any 
        });
        
        const result = await documentTool.execute({ title, content, kind });
        return {
          success: true,
          documentId: result.id,
          message: `Created ${kind} document: "${title}"`,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          message: 'Failed to create document',
        };
      }
    },
  });
}

// Document update tool for OpenAI Agent SDK
export function updateDocumentTool({ session }: { session: Session }) {
  return tool({
    description: 'Update an existing document with new content',
    parameters: z.object({
      documentId: z.string().describe('The ID of the document to update'),
      content: z.string().describe('The new content for the document'),
      title: z.string().nullable().describe('New title for the document (null if not changing title)'),
    }),
    execute: async ({ documentId, content, title }) => {
      try {
        // Dynamic import
        const { updateDocument } = await import('./update-document');
        const documentTool = updateDocument({ 
          session, 
          dataStream: {
            writeData: () => {}, // Mock data stream for now
          } as any 
        });
        
        const result = await documentTool.execute({ 
          documentId, 
          content,
          ...(title && { title })
        });
        
        return {
          success: true,
          message: `Updated document${title ? ` with new title: "${title}"` : ''}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          message: 'Failed to update document',
        };
      }
    },
  });
}

// Suggestions request tool for OpenAI Agent SDK
export function requestSuggestionsTool({ session }: { session: Session }) {
  return tool({
    description: 'Request suggestions for improving or continuing content',
    parameters: z.object({
      documentId: z.string().describe('The ID of the document to get suggestions for'),
      currentContent: z.string().describe('The current content to generate suggestions for'),
      requestType: z.enum(['improve', 'continue', 'alternatives']).describe('Type of suggestions requested'),
    }),
    execute: async ({ documentId, currentContent, requestType }) => {
      try {
        // Dynamic import
        const { requestSuggestions } = await import('./request-suggestions');
        const suggestionsTool = requestSuggestions({ 
          session, 
          dataStream: {
            writeData: () => {}, // Mock data stream for now
          } as any 
        });
        
        const result = await suggestionsTool.execute({ 
          documentId, 
          currentContent,
          requestType 
        });
        
        return {
          success: true,
          suggestions: result.suggestions,
          message: `Generated ${requestType} suggestions for the document`,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          message: 'Failed to generate suggestions',
        };
      }
    },
  });
}

// Career counseling tool for OpenAI Agent SDK
export function careerCounselingTool({ session, chatId }: { session: Session; chatId: string }) {
  return tool({
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
    execute: async ({ query, context, preferredAgent }) => {
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
          error: error.message,
        };
      }
    },
  });
}