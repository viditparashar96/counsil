import { tool } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import type { DataStreamWriter } from 'ai';

export function careerCounseling({
  session,
  dataStream,
  chatId,
}: {
  session: Session;
  dataStream: DataStreamWriter;
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
    execute: async ({ query, context, preferredAgent }) => {
      try {
        // Dynamic import to avoid server-only bundling issues
        const { CareerCounselingRouter } = await import('@/lib/agents/router');
        const router = new CareerCounselingRouter();

        // Route the message through the career counseling system
        const result = await router.routeMessage(query, {
          userId: session.user.id,
          chatId,
          currentAgent: preferredAgent,
          conversationHistory: [],
        });

        // Send agent information to the data stream
        dataStream.writeData({
          type: 'agent-response',
          content: {
            agentUsed: result.agentUsed,
            agentName: result.agentUsed === 'resume' ? 'Resume Expert' 
              : result.agentUsed === 'interview' ? 'Interview Coach'
              : result.agentUsed === 'planner' ? 'Career Planner' 
              : 'Job Search Advisor',
            response: result.response,
            suggestedAgent: result.suggestedAgent,
            handoffMessage: result.handoffMessage,
          }
        });

        // Return structured response
        let responseMessage = `**${result.agentUsed === 'resume' ? 'Resume Expert' 
          : result.agentUsed === 'interview' ? 'Interview Coach'
          : result.agentUsed === 'planner' ? 'Career Planner' 
          : 'Job Search Advisor'} Response:**\n\n${result.response}`;

        if (result.handoffMessage && result.suggestedAgent) {
          responseMessage += `\n\n---\n\n💡 **Suggestion:** ${result.handoffMessage}`;
        }

        return responseMessage;
      } catch (error) {
        console.error('Career counseling tool error:', error);
        
        return `I encountered an issue connecting with our career counseling specialists. Let me help you directly with your career question: ${query}. 

For comprehensive career guidance, our platform includes specialized agents for:
- **Resume Expert**: Resume writing, optimization, and ATS compliance
- **Interview Coach**: Interview preparation and behavioral question practice  
- **Career Planner**: Long-term career strategy and skill development
- **Job Search Advisor**: Job market navigation and networking strategies

How can I assist you with your career goals today?`;
      }
    },
  });
}