import { Agent, run } from '@openai/agents';
import OpenAI from 'openai';

// Create direct OpenAI client without gateway
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define our career counseling agents using OpenAI Agent SDK
export const careerAgents = {
  'chat-model': new Agent({
    name: 'General Assistant',
    instructions: `You are a helpful assistant with access to specialized career counseling agents. 

When users ask career-related questions, automatically route them to the appropriate specialist:
- Resume questions → Use careerCounseling tool
- Interview questions → Use careerCounseling tool  
- Career planning questions → Use careerCounseling tool
- Job search questions → Use careerCounseling tool

For general questions, respond directly and helpfully.`,
    model: 'gpt-4o',
    client: openaiClient,
  }),

  'chat-model-reasoning': new Agent({
    name: 'Reasoning Assistant', 
    instructions: 'You are a helpful assistant that thinks step by step. Use <think> tags to show your reasoning process.',
    model: 'gpt-4o',
    client: openaiClient,
  }),

  'title-model': new Agent({
    name: 'Title Generator',
    instructions: 'Generate concise, descriptive titles for conversations. Keep them under 6 words.',
    model: 'gpt-4o-mini',
    client: openaiClient,
  }),

  'artifact-model': new Agent({
    name: 'Artifact Creator',
    instructions: 'Create and modify documents, code, and other artifacts based on user requests.',
    model: 'gpt-4o',
    client: openaiClient,
  }),
};

// Agent runner function that replaces streamText
export async function runAgentWithStreaming(
  agentKey: keyof typeof careerAgents,
  messages: any[],
  tools: any[] = [],
  systemPrompt?: string
) {
  const agent = careerAgents[agentKey];
  
  if (!agent) {
    throw new Error(`Agent ${agentKey} not found`);
  }

  // Update agent instructions if system prompt provided
  if (systemPrompt) {
    agent.instructions = systemPrompt;
  }

  // Add tools to agent if provided
  if (tools.length > 0) {
    agent.tools = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name || tool.function?.name,
        description: tool.description || tool.function?.description,
        parameters: tool.parameters || tool.function?.parameters,
        execute: tool.execute,
      }
    }));
  }

  // Convert messages to OpenAI Agent SDK format
  const lastMessage = messages[messages.length - 1];
  const userInput = lastMessage.content || 'Hello';

  // Run agent with streaming
  const result = await run(agent, userInput, { 
    stream: true,
  });

  return result;
}

// Stream event converter for UI compatibility  
export function convertAgentStreamToUIStream(agentStream: any) {
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of agentStream) {
          // Convert OpenAI Agent SDK events to UI-compatible format
          if (event.type === 'raw_model_stream_event') {
            const data = event.data;
            
            if (data.type === 'output_text_delta') {
              // Text delta event
              const uiEvent = {
                type: 'text-delta',
                textDelta: data.delta,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(uiEvent)}\n\n`));
            }
            
            if (data.type === 'response_done') {
              // Response completion event
              const uiEvent = {
                type: 'finish',
                finishReason: 'stop',
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(uiEvent)}\n\n`));
            }
          }
          
          if (event.type === 'run_item_stream_event') {
            // Tool calls or other run items
            const uiEvent = {
              type: 'tool-call',
              toolCallId: event.item.id,
              toolName: event.item.name,
              args: event.item.arguments,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(uiEvent)}\n\n`));
          }
        }
        
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

// Legacy compatibility function
export const myProvider = {
  languageModel: (modelId: keyof typeof careerAgents) => ({
    modelId,
    agent: careerAgents[modelId],
    // Compatibility methods for existing code
    generateText: async (options: any) => {
      const result = await runAgentWithStreaming(modelId, options.messages, options.tools, options.system);
      await result.completed;
      return {
        text: result.finalOutput || '',
        usage: result.state.usage || {},
      };
    },
    streamText: async (options: any) => {
      const result = await runAgentWithStreaming(modelId, options.messages, options.tools, options.system);
      return {
        stream: convertAgentStreamToUIStream(result),
        usage: result.state.usage || {},
      };
    }
  })
};