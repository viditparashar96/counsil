import { useState, useCallback } from 'react';
import { api } from '@/lib/trpc';
import { toast } from '@/components/toast';

export interface AgentHandoffState {
  isHandoffAvailable: boolean;
  suggestedAgent: string | null;
  handoffMessage: string | null;
  currentAgent: string | null;
  isTransitioning: boolean;
  transitionMessage: string | null;
}

export function useAgentHandoffs(chatId: string) {
  const [handoffState, setHandoffState] = useState<AgentHandoffState>({
    isHandoffAvailable: false,
    suggestedAgent: null,
    handoffMessage: null,
    currentAgent: 'Career Counselor', // Default to triage agent
    isTransitioning: false,
    transitionMessage: null,
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
        currentAgent: result.agent.name,
        isHandoffAvailable: false,
        suggestedAgent: null,
        handoffMessage: null,
        isTransitioning: false,
        transitionMessage: null,
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
    // Show transition state
    setHandoffState(prev => ({
      ...prev,
      isTransitioning: true,
      transitionMessage: `Connecting you to ${targetAgent}...`,
      isHandoffAvailable: false,
    }));

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
    
    // Handle direct agent handoff updates from streaming
    if (data?.type === 'agent-handoff' && data.agentName) {
      setHandoffState(prev => ({
        ...prev,
        currentAgent: data.agentName,
        isTransitioning: false,
        transitionMessage: null,
      }));
    }
  }, []);

  // Method to update current agent from streaming events
  const updateCurrentAgent = useCallback((agentName: string) => {
    setHandoffState(prev => ({
      ...prev,
      currentAgent: agentName,
      isTransitioning: false,
      transitionMessage: null,
    }));
  }, []);

  // Method to detect agent from message content
  const detectAgentFromMessage = useCallback((messageText: string) => {
    const text = messageText.toLowerCase();
    
    // Look for handoff phrases in the message content
    if (text.includes('resume expert') || text.includes('resume specialist')) {
      setHandoffState(prev => ({ ...prev, currentAgent: 'Resume Expert', isTransitioning: false, transitionMessage: null }));
    } else if (text.includes('interview coach') || text.includes('interview specialist')) {
      setHandoffState(prev => ({ ...prev, currentAgent: 'Interview Coach', isTransitioning: false, transitionMessage: null }));
    } else if (text.includes('career planning specialist') || text.includes('career planner')) {
      setHandoffState(prev => ({ ...prev, currentAgent: 'Career Planning Specialist', isTransitioning: false, transitionMessage: null }));
    } else if (text.includes('job search advisor') || text.includes('job search specialist')) {
      setHandoffState(prev => ({ ...prev, currentAgent: 'Job Search Advisor', isTransitioning: false, transitionMessage: null }));
    }
  }, []);

  const resetAgent = useCallback(() => {
    setHandoffState({
      isHandoffAvailable: false,
      suggestedAgent: null,
      handoffMessage: null,
      currentAgent: 'Career Counselor',
      isTransitioning: false,
      transitionMessage: null,
    });
  }, []);

  return {
    handoffState,
    handleHandoff,
    dismissHandoff,
    processAgentResponse,
    updateCurrentAgent,
    detectAgentFromMessage,
    resetAgent,
    isHandoffLoading: handoffMutation.isPending,
  };
}