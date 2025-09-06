import { Agent, run } from '@openai/agents';
import OpenAI from 'openai';
import { CAREER_AGENTS, AGENT_HANDOFF_PROMPTS, type CareerAgent } from './config';

export interface AgentContext {
  userId: string;
  chatId: string;
  currentAgent?: string;
  conversationHistory: any[];
}

export class CareerCounselingRouter {
  private agents: Map<string, Agent> = new Map();
  private openai: OpenAI;

  constructor() {
    // Initialize OpenAI client directly
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.initializeAgents();
  }

  private initializeAgents() {
    // Create agents for each career specialist using OpenAI Agent SDK
    for (const [key, agentConfig] of Object.entries(CAREER_AGENTS)) {
      const agent = new Agent({
        name: agentConfig.name,
        model: agentConfig.model,
        instructions: agentConfig.instructions,
        // No tools needed for these specialist agents - they focus on conversation
      });

      this.agents.set(key, agent);
    }
  }

  async routeMessage(
    message: string,
    context: AgentContext
  ): Promise<{
    response: string;
    suggestedAgent?: string;
    handoffMessage?: string;
    agentUsed: string;
  }> {
    // Determine which agent to use
    const targetAgent = this.determineAgent(message, context.currentAgent);
    const agent = this.agents.get(targetAgent);

    if (!agent) {
      throw new Error(`Agent ${targetAgent} not found`);
    }

    // Prepare the message with context
    const contextualMessage = this.prepareContextualMessage(message, context, targetAgent);

    // Get response from the agent using OpenAI Agent SDK
    try {
      const result = await run(agent, contextualMessage, { 
        stream: false // Non-streaming for internal agent communication
      });

      // Wait for completion and get the final output
      const response = result.finalOutput || '';

      // Check if handoff is needed
      const handoffSuggestion = this.suggestHandoff(response, targetAgent, message);

      return {
        response,
        suggestedAgent: handoffSuggestion?.agent,
        handoffMessage: handoffSuggestion?.message,
        agentUsed: targetAgent
      };
    } catch (error) {
      console.error('Agent routing error:', error);
      throw new Error('Failed to process request with career counseling agent');
    }
  }

  private determineAgent(message: string, currentAgent?: string): string {
    const messageLower = message.toLowerCase();

    // Keywords for each agent type
    const agentKeywords = {
      resume: ['resume', 'cv', 'ats', 'optimize resume', 'resume review', 'resume help'],
      interview: ['interview', 'mock interview', 'behavioral questions', 'star method', 'interview prep'],
      planner: ['career plan', 'career change', 'skill development', 'career goals', 'transition'],
      jobsearch: ['job search', 'job hunt', 'job board', 'linkedin', 'networking', 'apply jobs']
    };

    // If user explicitly mentions switching agents
    if (messageLower.includes('switch to') || messageLower.includes('connect me to')) {
      for (const [agentKey, keywords] of Object.entries(agentKeywords)) {
        if (keywords.some(keyword => messageLower.includes(keyword))) {
          return agentKey;
        }
      }
    }

    // If no current agent, determine based on message content
    if (!currentAgent) {
      for (const [agentKey, keywords] of Object.entries(agentKeywords)) {
        if (keywords.some(keyword => messageLower.includes(keyword))) {
          return agentKey;
        }
      }
      // Default to career planner for general questions
      return 'planner';
    }

    // Check if message suggests switching to a different agent
    for (const [agentKey, keywords] of Object.entries(agentKeywords)) {
      if (agentKey !== currentAgent && keywords.some(keyword => messageLower.includes(keyword))) {
        return agentKey;
      }
    }

    // Stay with current agent
    return currentAgent;
  }

  private prepareContextualMessage(
    message: string,
    context: AgentContext,
    targetAgent: string
  ): string {
    const agentInfo = CAREER_AGENTS[targetAgent];
    
    let contextualMessage = `As the ${agentInfo.name}, I'm here to help with ${agentInfo.specialization}.\n\n`;
    
    // Add conversation context if switching agents
    if (context.currentAgent && context.currentAgent !== targetAgent) {
      contextualMessage += `Note: The user was previously working with the ${CAREER_AGENTS[context.currentAgent]?.name}. Please acknowledge this transition and build upon any previous work mentioned.\n\n`;
    }
    
    contextualMessage += `User question: ${message}`;
    
    return contextualMessage;
  }

  private suggestHandoff(
    response: string,
    currentAgent: string,
    originalMessage: string
  ): { agent: string; message: string } | null {
    const responseLower = response.toLowerCase();
    const messageLower = originalMessage.toLowerCase();

    // Handoff scenarios based on current agent and response content
    const handoffScenarios = [
      // From resume expert
      {
        from: 'resume',
        to: 'interview',
        triggers: ['interview', 'prepare for interview', 'mock interview'],
        message: AGENT_HANDOFF_PROMPTS.resume_to_interview
      },
      {
        from: 'resume',
        to: 'jobsearch',
        triggers: ['job search', 'apply', 'find jobs', 'job hunting'],
        message: AGENT_HANDOFF_PROMPTS.resume_to_jobsearch
      },
      
      // From interview coach
      {
        from: 'interview',
        to: 'resume',
        triggers: ['resume', 'cv', 'optimize resume'],
        message: AGENT_HANDOFF_PROMPTS.interview_to_resume
      },
      {
        from: 'interview',
        to: 'jobsearch',
        triggers: ['job search', 'find opportunities', 'where to apply'],
        message: AGENT_HANDOFF_PROMPTS.interview_to_jobsearch
      },
      
      // From career planner
      {
        from: 'planner',
        to: 'resume',
        triggers: ['resume', 'cv', 'update resume'],
        message: AGENT_HANDOFF_PROMPTS.planner_to_resume
      },
      {
        from: 'planner',
        to: 'interview',
        triggers: ['interview', 'interview prep', 'behavioral questions'],
        message: AGENT_HANDOFF_PROMPTS.planner_to_interview
      },
      
      // From job search advisor
      {
        from: 'jobsearch',
        to: 'resume',
        triggers: ['resume', 'cv', 'optimize resume'],
        message: AGENT_HANDOFF_PROMPTS.jobsearch_to_resume
      },
      {
        from: 'jobsearch',
        to: 'interview',
        triggers: ['interview', 'prepare for interview'],
        message: AGENT_HANDOFF_PROMPTS.jobsearch_to_interview
      }
    ];

    for (const scenario of handoffScenarios) {
      if (scenario.from === currentAgent) {
        const shouldHandoff = scenario.triggers.some(trigger => 
          responseLower.includes(trigger) || messageLower.includes(trigger)
        );
        
        if (shouldHandoff) {
          return {
            agent: scenario.to,
            message: scenario.message
          };
        }
      }
    }

    return null;
  }

  getAgentInfo(agentId: string): CareerAgent | null {
    return CAREER_AGENTS[agentId] || null;
  }

  listAvailableAgents(): CareerAgent[] {
    return Object.values(CAREER_AGENTS);
  }
}