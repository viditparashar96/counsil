import { useState, useCallback } from 'react';
import { api } from '@/lib/trpc';
import { toast } from '@/components/toast';

export interface AgentHandoffState {
  isHandoffAvailable: boolean;
  suggestedAgent: string | null;
  handoffMessage: string | null;
  currentAgent: string | null;
}

export function useAgentHandoffs(chatId: string) {
  const [handoffState, setHandoffState] = useState<AgentHandoffState>({
    isHandoffAvailable: false,
    suggestedAgent: null,
    handoffMessage: null,
    currentAgent: null,
  });

  const utils = api.useUtils();

  const handoffMutation = api.agents.handoffToAgent.useMutation({
    onSuccess: (result) => {
      toast({
        type: 'success',
        description: `Connected to ${result.agent.name}`,
      });
      
      // Update current agent state
      setHandoffState(prev => ({
        ...prev,
        currentAgent: result.agent.id,
        isHandoffAvailable: false,
        suggestedAgent: null,
        handoffMessage: null,
      }));
    },
    onError: (error) => {
      toast({
        type: 'error',
        description: `Failed to connect to agent: ${error.message}`,
      });
    },
  });

  const handleHandoff = useCallback((targetAgent: string, context?: string) => {
    handoffMutation.mutate({
      targetAgent,
      chatId,
      context,
    });
  }, [handoffMutation, chatId]);

  const dismissHandoff = useCallback(() => {
    setHandoffState(prev => ({
      ...prev,
      isHandoffAvailable: false,
      suggestedAgent: null,
      handoffMessage: null,
    }));
  }, []);

  const processAgentResponse = useCallback((data: any) => {
    if (data?.type === 'agent-response' && data.content) {
      const { agentUsed, suggestedAgent, handoffMessage } = data.content;
      
      // Update current agent
      setHandoffState(prev => ({
        ...prev,
        currentAgent: agentUsed,
      }));

      // Show handoff suggestion if available
      if (suggestedAgent && handoffMessage) {
        setHandoffState(prev => ({
          ...prev,
          isHandoffAvailable: true,
          suggestedAgent,
          handoffMessage,
        }));
      }
    }
  }, []);

  const resetAgent = useCallback(() => {
    setHandoffState({
      isHandoffAvailable: false,
      suggestedAgent: null,
      handoffMessage: null,
      currentAgent: null,
    });
  }, []);

  return {
    handoffState,
    handleHandoff,
    dismissHandoff,
    processAgentResponse,
    resetAgent,
    isHandoffLoading: handoffMutation.isPending,
  };
}