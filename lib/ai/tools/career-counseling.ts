import { tool } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';

export function careerCounseling({
  session,
  dataStream,
  chatId,
}: {
  session: Session;
  dataStream: any;
  chatId: string;
}) {
  return tool({
    description: `Route career-related questions to specialized AI agents. Use this tool when users ask about:
- Resume writing, optimization, or review
- Interview preparation and practice
- Career planning and transitions
- Job search strategies and networking
- Professional development

The tool will automatically determine which career specialist to use and provide expert guidance.`,
    parameters: z.object({
      query: z.string().describe('The career-related question or request from the user'),
      context: z.string().optional().describe('Additional context about the user\'s situation'),
      preferredAgent: z.enum(['resume', 'interview', 'planner', 'jobsearch']).optional().describe('Specific agent to use if known'),
    }),
    //@ts-ignore
    execute: async ({ query, context, preferredAgent }: { query: string; context?: string; preferredAgent?: 'resume' | 'interview' | 'planner' | 'jobsearch' }) => {
      try {
        // Dynamic import to avoid server-only bundling issues
        const { CareerCounselingSystem } = await import('@/lib/agents/career-counseling-system');
        
        // Create a career counseling system instance
        const careerSystem = new CareerCounselingSystem({
          session,
          chatId,
          conversationHistory: [], // This would be populated from the chat context in a real scenario
        });

        // Route the message through the career counseling system
        //@ts-ignore
        const result = await careerSystem.routeMessage(query, {
          preferredAgent,
          conversationHistory: [],
        });

        // Format response for the main agent
        let responseMessage = `**${result.agentUsed} Response:**\n\n${result.response}`;

        if (result.handoffMessage && result.suggestedAgent) {
          responseMessage += `\n\n---\n\n💡 **Suggestion:** ${result.handoffMessage}`;
        }

        // Write to the data stream to show the career specialist is working
        dataStream.writeData({
          type: 'step-start',
          step: {
            toolCallId: 'career-counseling',
            toolName: 'career-counseling',
            stepType: 'tool-call',
            reasoning: `Routing your career question to our ${result.agentUsed} for specialized guidance...`,
          },
        });

        dataStream.writeData({
          type: 'step-finish',
          step: {
            toolCallId: 'career-counseling',
            toolName: 'career-counseling',
            stepType: 'tool-call',
            result: responseMessage,
          },
        });

        return {
          response: responseMessage,
          agentUsed: result.agentUsed,
          suggestedAgent: result.suggestedAgent,
          handoffMessage: result.handoffMessage,
        };
      } catch (error) {
        console.error('Career counseling tool error:', error);
        
        const errorMessage = `I encountered an issue connecting with our career counseling specialists. Let me help you directly with your career question: ${query}. 

For comprehensive career guidance, our platform includes specialized agents for:
- **Resume Expert**: Resume writing, optimization, and ATS compliance
- **Interview Coach**: Interview preparation and behavioral question practice  
- **Career Planner**: Long-term career strategy and skill development
- **Job Search Advisor**: Job market navigation and networking strategies

How can I assist you with your career goals today?`;

        dataStream.writeData({
          type: 'step-start',
          step: {
            toolCallId: 'career-counseling',
            toolName: 'career-counseling',
            stepType: 'tool-call',
            reasoning: 'Processing your career question...',
          },
        });

        dataStream.writeData({
          type: 'step-finish',
          step: {
            toolCallId: 'career-counseling',
            toolName: 'career-counseling',
            stepType: 'tool-call',
            result: errorMessage,
          },
        });

        return {
          response: errorMessage,
          error: error instanceof Error ? error.message : String(error),
          agentUsed: 'Error Handler',
        };
      }
    },
  });
}