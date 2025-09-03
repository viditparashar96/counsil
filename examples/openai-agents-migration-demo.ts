/**
 * OpenAI Agent SDK Migration Demo
 * 
 * This file demonstrates the migration from Vercel AI SDK with gateway provider
 * to direct OpenAI Agent SDK implementation with streaming support.
 */

import { Agent, Runner, tool } from '@openai/agents';
import { z } from 'zod';
import { agentStreamAdapter, createCareerCounselingAgentTool } from '@/lib/ai/openai-agents-integration';

// Example: Before Migration (Problematic Gateway Approach)
/*
import { gateway } from '@ai-sdk/gateway';
import { streamText } from 'ai';

const problematicProvider = gateway.languageModel('xai/grok-2-vision-1212');
const stream = streamText({
  model: problematicProvider, // This causes "offline:chat" errors
  messages: [...],
  tools: {...}
});
*/

// Example: After Migration (Direct OpenAI Agent SDK)
async function migratedChatExample() {
  try {
    // 1. Create an agent with streaming support
    const agent = agentStreamAdapter.createAgent({
      name: 'Chat Assistant',
      instructions: 'You are a helpful AI assistant with access to specialized career counseling agents.',
      model: 'gpt-4o', // Direct OpenAI model, no gateway needed
      tools: [
        // Weather tool example
        tool({
          name: 'getWeather',
          description: 'Get weather information for a location',
          parameters: z.object({
            location: z.string().describe('The location to get weather for'),
          }),
          execute: async ({ location }) => {
            // Simulate weather API call
            return `The weather in ${location} is sunny with 72°F`;
          },
        }),

        // Career counseling tool (maintains tRPC integration)
        createCareerCounselingAgentTool(
          { user: { id: 'user123' } } as any, // Mock session
          {
            writeData: (data) => console.log('Career data:', data),
            merge: () => {},
          },
          'chat123'
        ),
      ],
    });

    // 2. Stream the agent response
    const messages = [
      { role: 'user', content: 'What\'s the weather in San Francisco, and can you help me with my resume?' }
    ];

    console.log('🚀 Starting OpenAI Agent SDK streaming...');

    await agentStreamAdapter.streamAgent(messages, {
      onEvent: (event) => {
        switch (event.type) {
          case 'text-delta':
            process.stdout.write(event.textDelta);
            break;
          case 'tool-call':
            console.log(`\n🔧 Tool called: ${event.toolName}`);
            break;
          case 'tool-result':
            console.log(`✅ Tool result: ${event.result}`);
            break;
          case 'agent-handoff':
            console.log(`🤝 Agent handoff: ${JSON.stringify(event.handoffData)}`);
            break;
        }
      },
      onComplete: (result) => {
        console.log('\n✅ Streaming completed!');
        console.log('Final result:', result);
      },
      onError: (error) => {
        console.error('❌ Streaming error:', error);
      },
    });

  } catch (error) {
    console.error('Migration demo error:', error);
  }
}

// Example: tRPC Integration (maintains existing patterns)
async function trpcIntegrationExample() {
  console.log('🔗 tRPC Career Counseling Integration');
  
  try {
    // This would be called from your tRPC router
    const { CareerCounselingRouter } = await import('@/lib/agents/router');
    const router = new CareerCounselingRouter();

    const result = await router.routeMessage(
      'Can you help me optimize my resume for a software engineering role?',
      {
        userId: 'user123',
        chatId: 'chat456', 
        currentAgent: 'resume',
        conversationHistory: [],
      }
    );

    console.log('Career counseling result:', {
      agentUsed: result.agentUsed,
      response: result.response.substring(0, 100) + '...',
      suggestedAgent: result.suggestedAgent,
    });

  } catch (error) {
    console.error('tRPC integration error:', error);
  }
}

// Example: Streaming Response Format Comparison
function streamingFormatComparison() {
  console.log('📊 Streaming Format Comparison');

  // Before: Vercel AI SDK format
  const vercelFormat = {
    type: 'textDelta',
    textDelta: 'Hello',
  };

  // After: OpenAI Agent SDK format (converted to compatible format)
  const agentFormat = {
    type: 'text-delta', // Converted to kebab-case for consistency
    textDelta: 'Hello',
  };

  console.log('Vercel AI SDK format:', vercelFormat);
  console.log('OpenAI Agent SDK format (converted):', agentFormat);
  console.log('✅ Formats are compatible through the integration layer');
}

// Main demo function
async function runMigrationDemo() {
  console.log('🎯 OpenAI Agent SDK Migration Demo\n');

  console.log('1. Streaming Format Comparison');
  streamingFormatComparison();
  console.log('\n');

  console.log('2. Migrated Chat Example with Streaming');
  await migratedChatExample();
  console.log('\n');

  console.log('3. tRPC Integration Example');
  await trpcIntegrationExample();
  console.log('\n');

  console.log('🎉 Migration demo completed!');
  console.log('\nKey Benefits of Migration:');
  console.log('✅ No more "offline:chat" errors from gateway dependency');
  console.log('✅ Direct OpenAI API access with better reliability');
  console.log('✅ Native streaming support through OpenAI Agent SDK');
  console.log('✅ Maintained compatibility with existing tRPC career agents');
  console.log('✅ Enhanced tool calling and agent handoff capabilities');
}

// Export for testing
export {
  migratedChatExample,
  trpcIntegrationExample,
  streamingFormatComparison,
  runMigrationDemo,
};

// Run demo if this file is executed directly
if (require.main === module) {
  runMigrationDemo().catch(console.error);
}