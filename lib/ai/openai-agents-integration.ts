import { Agent, Runner, tool } from '@openai/agents';
import { z } from 'zod';
import type { Session } from 'next-auth';

/**
 * OpenAI Agent SDK Integration Layer
 * 
 * This module provides integration between OpenAI Agent SDK and the existing
 * Vercel AI SDK patterns, maintaining compatibility with tRPC and career counseling agents.
 */

export interface AgentStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'agent-handoff' | 'agent-update' | 'finish' | 'error';
  [key: string]: any;
}

export interface DataStreamWriter {
  writeData: (data: any) => void;
  merge: (stream: any) => void;
}

export class OpenAIAgentStreamAdapter {
  private runner: Runner;
  private agent: Agent | null = null;

  constructor(apiKey?: string) {
    this.runner = new Runner({
      // Configure runner with API key if provided
    });
  }

  // Create an agent compatible with existing tool patterns
  createAgent(config: {
    name: string;
    instructions: string;
    model: string;
    tools: any[];
  }): Agent {
    // Convert existing tools to OpenAI Agent SDK format
    const agentTools = config.tools.map(existingTool => this.convertTool(existingTool));

    this.agent = new Agent({
      name: config.name,
      instructions: config.instructions,
      model: this.mapModelName(config.model),
      tools: agentTools,
    });

    return this.agent;
  }

  // Convert existing Vercel AI SDK tools to OpenAI Agent SDK tools
  private convertTool(existingTool: any) {
    return tool({
      name: existingTool.description || 'unnamed_tool',
      description: existingTool.description || '',
      parameters: this.convertParameters(existingTool.parameters),
      execute: async (params: any) => {
        try {
          // Call the existing tool's execute method
          const result = await existingTool.execute(params);
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
          console.error(`Tool execution error for ${existingTool.description}:`, error);
          return `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    });
  }

  // Convert parameters from existing format to Zod schema
  private convertParameters(parameters: any): z.ZodSchema {
    if (!parameters || !parameters.properties) {
      return z.object({});
    }

    const zodObject: Record<string, z.ZodType> = {};

    for (const [key, prop] of Object.entries(parameters.properties)) {
      const property = prop as any;
      
      switch (property.type) {
        case 'string':
          zodObject[key] = z.string().describe(property.description || '');
          break;
        case 'number':
          zodObject[key] = z.number().describe(property.description || '');
          break;
        case 'boolean':
          zodObject[key] = z.boolean().describe(property.description || '');
          break;
        case 'object':
          zodObject[key] = z.object({}).describe(property.description || '');
          break;
        case 'array':
          zodObject[key] = z.array(z.any()).describe(property.description || '');
          break;
        default:
          zodObject[key] = z.any().describe(property.description || '');
      }

      // Make optional if not required
      if (!parameters.required?.includes(key)) {
        zodObject[key] = zodObject[key].optional();
      }
    }

    return z.object(zodObject);
  }

  // Map existing model names to OpenAI Agent SDK compatible names
  private mapModelName(model: string): string {
    const modelMap: Record<string, string> = {
      'chat-model': 'gpt-4o',
      'chat-model-reasoning': 'gpt-4o',
      'title-model': 'gpt-4o-mini',
      'artifact-model': 'gpt-4o',
    };

    return modelMap[model] || 'gpt-4o';
  }

  // Stream agent response with compatibility layer
  async streamAgent(
    messages: any[],
    options: {
      onEvent?: (event: AgentStreamEvent) => void;
      onComplete?: (result: any) => void;
      onError?: (error: Error) => void;
    } = {}
  ) {
    if (!this.agent) {
      throw new Error('Agent not created. Call createAgent first.');
    }

    try {
      // Convert messages to Agent SDK format
      const agentMessages = this.convertMessages(messages);

      // Run agent with streaming
      const stream = await this.runner.run(this.agent, agentMessages, {
        stream: true,
      });

      // Process stream events
      for await (const event of stream) {
        const transformedEvent = this.transformEvent(event);
        if (transformedEvent && options.onEvent) {
          options.onEvent(transformedEvent);
        }
      }

      // Wait for completion
      const result = await stream.completed;
      if (options.onComplete) {
        options.onComplete(result);
      }

      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown streaming error');
      if (options.onError) {
        options.onError(err);
      }
      throw err;
    }
  }

  // Convert UI messages to Agent SDK format
  private convertMessages(messages: any[]) {
    return messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: this.extractContent(msg),
    }));
  }

  // Extract content from message parts
  private extractContent(message: any): string {
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    if (message.parts && Array.isArray(message.parts)) {
      return message.parts
        .map((part: any) => part.text || '')
        .join('');
    }

    return message.content?.toString() || '';
  }

  // Transform OpenAI Agent SDK events to existing format
  private transformEvent(event: any): AgentStreamEvent | null {
    switch (event.type) {
      case 'raw_model_stream_event':
        if (event.data?.type === 'output_text_delta') {
          return {
            type: 'text-delta',
            textDelta: event.data.delta,
          };
        }
        break;

      case 'run_item_stream_event':
        switch (event.name) {
          case 'tool_call_started':
            return {
              type: 'tool-call',
              toolCallId: event.item?.id,
              toolName: event.item?.name,
              args: event.item?.arguments,
            };
          
          case 'tool_call_completed':
            return {
              type: 'tool-result',
              toolCallId: event.item?.id,
              result: event.item?.result,
            };

          case 'handoff_occurred':
            return {
              type: 'agent-handoff',
              handoffData: event.item,
            };
        }
        break;

      case 'agent_updated_stream_event':
        return {
          type: 'agent-update',
          agent: event.agent,
        };
    }

    return null;
  }

  // Create a stream-compatible response for existing UI
  createStreamResponse(
    messages: any[],
    tools: any[],
    config: {
      model: string;
      systemPrompt: string;
      onData?: (data: any) => void;
    }
  ) {
    // Create agent with provided configuration
    const agent = this.createAgent({
      name: 'Chat Assistant',
      instructions: config.systemPrompt,
      model: config.model,
      tools: tools,
    });

    // Return a stream-like interface compatible with existing code
    return {
      stream: this.createReadableStream(messages, config.onData),
      completed: this.streamAgent(messages, {
        onEvent: (event) => {
          if (config.onData) {
            config.onData(event);
          }
        },
      }),
    };
  }

  // Create a ReadableStream compatible with existing streaming infrastructure
  private createReadableStream(messages: any[], onData?: (data: any) => void) {
    const adapter = this;
    
    return new ReadableStream({
      async start(controller) {
        try {
          if (!adapter.agent) {
            throw new Error('Agent not initialized');
          }

          const stream = await adapter.runner.run(
            adapter.agent,
            adapter.convertMessages(messages),
            { stream: true }
          );

          for await (const event of stream) {
            const transformedEvent = adapter.transformEvent(event);
            if (transformedEvent) {
              const chunk = JSON.stringify(transformedEvent) + '\n';
              controller.enqueue(new TextEncoder().encode(chunk));
              
              if (onData) {
                onData(transformedEvent);
              }
            }
          }

          // Send completion event
          const completionChunk = JSON.stringify({
            type: 'finish',
            finishReason: 'stop',
          }) + '\n';
          controller.enqueue(new TextEncoder().encode(completionChunk));
          
          controller.close();

        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });
  }
}

// Create a singleton instance for the application
export const agentStreamAdapter = new OpenAIAgentStreamAdapter(
  process.env.OPENAI_API_KEY
);

// Utility function to create career counseling tool compatible with OpenAI Agent SDK
export function createCareerCounselingAgentTool(
  session: Session,
  dataStream: DataStreamWriter,
  chatId: string
) {
  return tool({
    name: 'careerCounseling',
    description: `Route career-related questions to specialized AI agents. Use this tool when users ask about:
- Resume writing, optimization, or review
- Interview preparation and practice
- Career planning and transitions
- Job search strategies and networking
- Professional development`,
    parameters: z.object({
      query: z.string().describe('The career-related question or request from the user'),
      context: z.string().optional().describe('Additional context about the user\'s situation'),
      preferredAgent: z.enum(['resume', 'interview', 'planner', 'jobsearch']).optional().describe('Specific agent to use if known'),
    }),
    execute: async ({ query, context, preferredAgent }) => {
      try {
        // Import the career counseling router
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

        // Return formatted response
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