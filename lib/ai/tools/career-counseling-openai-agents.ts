import { tool } from '@openai/agents';
import { z } from 'zod';
import type { Session } from 'next-auth';

export function createCareerCounselingTool({
  session,
  chatId,
}: {
  session: Session;
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

        let responseMessage = `**${agentName}:**\n\n${result.response}`;

        if (result.handoffMessage && result.suggestedAgent) {
          responseMessage += `\n\n---\n\n💡 **Suggestion:** ${result.handoffMessage}`;
        }

        return {
          result: responseMessage,
          agentUsed: result.agentUsed,
          suggestedAgent: result.suggestedAgent,
          handoffMessage: result.handoffMessage,
        };
      } catch (error) {
        console.error('Career counseling tool error:', error);
        
        return {
          result: `I encountered an issue connecting with our career counseling specialists. Let me help you directly with your career question: ${query}. 

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