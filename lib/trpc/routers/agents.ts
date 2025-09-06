import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../init';

export const agentsRouter = createTRPCRouter({
  // Get available career counseling agents
  getAvailableAgents: protectedProcedure
    .query(async ({ ctx }) => {
      const { CareerCounselingRouter } = await import('@/lib/agents/router');
      const router = new CareerCounselingRouter();
      
      return router.listAvailableAgents();
    }),

  // Get specific agent information
  getAgent: protectedProcedure
    .input(
      z.object({
        agentId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const { CareerCounselingRouter } = await import('@/lib/agents/router');
      const router = new CareerCounselingRouter();
      
      const agent = router.getAgentInfo(input.agentId);
      
      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found',
        });
      }

      return agent;
    }),

  // Route a message through the agent system
  routeMessage: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1),
        chatId: z.string().min(1),
        currentAgent: z.string().optional(),
        conversationHistory: z.array(z.any()).optional().default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { message, chatId, currentAgent, conversationHistory } = input;

      try {
        const { CareerCounselingRouter } = await import('@/lib/agents/router');
        const router = new CareerCounselingRouter();

        const result = await router.routeMessage(message, {
          userId,
          chatId,
          currentAgent,
          conversationHistory,
        });

        return result;
      } catch (error) {
        console.error('Agent routing error:', error);
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process message through career counseling agents',
        });
      }
    }),

  // Handle agent handoff
  handoffToAgent: protectedProcedure
    .input(
      z.object({
        targetAgent: z.string().min(1),
        chatId: z.string().min(1),
        context: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { targetAgent, chatId, context } = input;

      try {
        const { CareerCounselingRouter } = await import('@/lib/agents/router');
        const router = new CareerCounselingRouter();

        // Verify the target agent exists
        const agentInfo = router.getAgentInfo(targetAgent);
        if (!agentInfo) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Target agent not found',
          });
        }

        // Prepare handoff message
        const handoffMessage = context 
          ? `I'm transferring you to our ${agentInfo.name}. Context: ${context}`
          : `I'm connecting you with our ${agentInfo.name} who specializes in ${agentInfo.specialization}.`;

        return {
          agent: agentInfo,
          handoffMessage,
          success: true,
        };
      } catch (error) {
        console.error('Agent handoff error:', error);
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to complete agent handoff',
        });
      }
    }),

  // Get current conversation context for agent
  getConversationContext: protectedProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        limit: z.number().min(1).max(50).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { chatId, limit } = input;

      try {
        // Get recent messages from the chat
        const { getMessagesByChatId } = await import('@/lib/db/queries');
        const messages = await getMessagesByChatId({ id: chatId });

        // Filter to user's messages only and limit
        const userMessages = messages
          .filter((msg) => msg.role === 'user')
          .slice(-limit)
          .map((msg) => ({
            id: msg.id,
            content: (msg as any).content || (Array.isArray(msg.parts) ? (msg.parts as any[]).map((p: any) => p.type === 'text' ? p.text : '[file]').join(' ') : 'No content'),
            timestamp: msg.createdAt,
          }));

        return {
          chatId,
          messages: userMessages,
          totalMessages: userMessages.length,
        };
      } catch (error) {
        console.error('Conversation context error:', error);
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get conversation context',
        });
      }
    }),
});