# OpenAI Agent SDK Migration Guide

## Overview

This guide documents the migration from Vercel AI SDK with gateway provider to direct OpenAI Agent SDK implementation, solving the "offline:chat" errors while maintaining streaming functionality and tRPC integration.

## Problem Statement

### Before Migration Issues:
1. **Gateway Dependency**: Using `@ai-sdk/gateway` with `gateway.languageModel('xai/grok-2-vision-1212')` causing "offline:chat" errors
2. **Provider Limitations**: Gateway provider requires AI Gateway access which isn't available
3. **Streaming Complexity**: Need to maintain `streamText()` functionality with streaming responses
4. **tRPC Integration**: Must preserve existing career counseling agent handoff system

### Root Cause:
```typescript
// PROBLEMATIC: This causes "offline:chat" errors
import { gateway } from '@ai-sdk/gateway';
const problematicProvider = gateway.languageModel('xai/grok-2-vision-1212');
```

## Migration Solution

### 1. Installed Dependencies
```bash
npm install @openai/agents @openai/agents-extensions zod@3 --legacy-peer-deps
```

### 2. Created Integration Layer
- **File**: `lib/ai/openai-agents-integration.ts`
- **Purpose**: Bridge between OpenAI Agent SDK and existing Vercel AI SDK patterns
- **Key Features**:
  - Stream compatibility with existing UI components
  - Tool conversion from Vercel AI SDK format to OpenAI Agent SDK
  - tRPC integration preservation

### 3. Updated Provider System
- **File**: `lib/ai/providers-openai-agents.ts`
- **Replaced**: Gateway-based provider with direct OpenAI API calls
- **Benefits**: No more gateway dependency, direct model access

### 4. Modified Chat API Route
- **File**: `app/(chat)/api/chat/route.ts`
- **Changes**: 
  - Replaced `streamText()` with OpenAI Agent SDK streaming
  - Maintained tool compatibility
  - Preserved career counseling agent integration

## Key Files Created/Modified

### 1. Integration Layer (`lib/ai/openai-agents-integration.ts`)
```typescript
export class OpenAIAgentStreamAdapter {
  // Converts existing tools to OpenAI Agent SDK format
  // Provides streaming compatibility with existing UI
  // Maintains tRPC integration for career counseling
}
```

### 2. Provider Replacement (`lib/ai/providers-openai-agents.ts`)  
```typescript
// Direct OpenAI provider - no gateway dependency
class DirectOpenAIProvider {
  createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL, // Support for XAI endpoints
    });
  }
}
```

### 3. Chat API Route Updates
```typescript
// BEFORE: Gateway-based streaming
const stream = createUIMessageStream({
  execute: ({ writer: dataStream }) => {
    const result = streamText({
      model: myProvider.languageModel(selectedChatModel), // Problematic
      // ...
    });
  }
});

// AFTER: OpenAI Agent SDK streaming
const agentResponse = agentStreamAdapter.createStreamResponse(
  uiMessages,
  tools,
  {
    model: selectedChatModel,
    systemPrompt: systemPrompt({ selectedChatModel, requestHints }),
  }
);
```

## Migration Benefits

### ✅ Problems Solved
1. **No More "offline:chat" Errors**: Direct OpenAI API eliminates gateway dependency
2. **Enhanced Streaming**: Native OpenAI Agent SDK streaming with better event handling
3. **Improved Reliability**: Direct API calls with better error handling
4. **Maintained Compatibility**: Existing UI components work without changes

### ✅ Features Preserved
1. **tRPC Integration**: Career counseling agents still work through tRPC
2. **Tool System**: All existing tools (weather, documents, suggestions) maintained
3. **Streaming UI**: Client-side streaming components unchanged
4. **Agent Handoffs**: Enhanced with OpenAI Agent SDK handoff capabilities

### ✅ Enhanced Capabilities
1. **Better Agent Management**: OpenAI Agent SDK provides better agent lifecycle management
2. **Enhanced Tool Calling**: More robust tool execution and error handling
3. **Agent Handoffs**: Native support for agent-to-agent handoffs
4. **Streaming Events**: Richer event system for better UI feedback

## Implementation Details

### Streaming Event Conversion
The integration layer converts OpenAI Agent SDK events to existing UI format:

```typescript
// OpenAI Agent SDK Event
{
  type: 'raw_model_stream_event',
  data: { type: 'output_text_delta', delta: 'Hello' }
}

// Converted to UI Format
{
  type: 'text-delta',
  textDelta: 'Hello'
}
```

### Tool Compatibility
Existing tools are automatically converted:

```typescript
// Existing Vercel AI SDK Tool
const existingTool = {
  description: 'Get weather',
  parameters: { type: 'object', properties: { location: { type: 'string' } } },
  execute: async ({ location }) => `Weather in ${location}`
};

// Auto-converted to OpenAI Agent SDK Tool
const convertedTool = tool({
  name: 'getWeather',
  description: 'Get weather',
  parameters: z.object({ location: z.string() }),
  execute: async ({ location }) => `Weather in ${location}`
});
```

### Career Counseling Integration
tRPC career counseling maintains full compatibility:

```typescript
// Career counseling still works through tRPC
const result = await router.routeMessage(query, {
  userId: session.user.id,
  chatId,
  currentAgent: preferredAgent,
  conversationHistory: [],
});

// Results are streamed through OpenAI Agent SDK
dataStream.writeData({
  type: 'agent-response',
  content: {
    agentUsed: result.agentUsed,
    response: result.response,
  }
});
```

## Testing the Migration

### 1. Run Demo Script
```bash
npx tsx examples/openai-agents-migration-demo.ts
```

### 2. Test Chat Functionality
1. Start the development server: `npm run dev`
2. Navigate to chat interface
3. Send a message to test streaming
4. Test career counseling: "Can you help me with my resume?"

### 3. Verify tRPC Integration
```typescript
// Test career counseling through tRPC
const result = await trpc.agents.routeMessage.mutate({
  message: 'Help me prepare for interviews',
  chatId: 'test-chat',
});
```

## Environment Variables

Ensure these environment variables are set:

```bash
OPENAI_API_KEY=your_openai_api_key
XAI_API_KEY=your_xai_api_key  # Optional, for XAI models
```

## Troubleshooting

### Common Issues

1. **Type Errors**: Ensure all imports are from `@openai/agents`
2. **Streaming Issues**: Check that `ReadableStream` is properly implemented
3. **Tool Conversion**: Verify tool parameters are Zod-compatible
4. **tRPC Integration**: Ensure career counseling router is properly imported

### Debug Mode
Enable debug logging:
```bash
DEBUG=openai-agents* npm run dev
```

## Rollback Plan

If issues arise, you can temporarily revert by:
1. Switching the import in `app/(chat)/api/chat/route.ts`
2. Commenting out OpenAI Agent SDK code
3. Uncommenting original Vercel AI SDK code

## Next Steps

1. **Monitor Performance**: Check streaming latency and error rates
2. **Enhance Integration**: Add more OpenAI Agent SDK features
3. **Optimize Tools**: Improve tool conversion and execution
4. **Add More Models**: Support additional model providers through OpenAI Agent SDK

## Conclusion

This migration successfully resolves the "offline:chat" errors while enhancing the overall chat system with:
- Direct OpenAI API access (no gateway dependency)
- Native streaming through OpenAI Agent SDK
- Maintained tRPC integration for career counseling
- Enhanced agent handoff capabilities
- Better tool management and execution

The system is now more reliable, performant, and ready for future enhancements with the OpenAI Agent SDK ecosystem.