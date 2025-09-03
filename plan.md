# Career Counseling Chat Application - Simple Implementation Plan

## Overview

This plan outlines the migration of the existing chat application to meet PRD requirements. The current codebase already has most features needed - we just need to migrate to tRPC + TanStack Query and adjust the AI to focus on career counseling.

## Current Status ✅

**Already Implemented (Perfect for PRD):**
- ✅ Next.js 15 App Router with TypeScript
- ✅ PostgreSQL database with Drizzle ORM  
- ✅ NextAuth authentication system
- ✅ Chat interface with message history
- ✅ Chat session management (can see previous chats, continue conversations)
- ✅ Message persistence (all messages saved to database)
- ✅ Responsive UI components
- ✅ File upload and document handling
- ✅ Real-time streaming
- ✅ Perfect database schema (User, Chat, Message_v2 tables)

**Only Need to Change:**
- 🔄 API Layer: Next.js API routes → tRPC (PRD requirement)
- 🔄 Data Fetching: SWR → TanStack Query v5 (PRD requirement)  
- 🔄 AI System: Add OpenAI Agent SDK with chat-based handoffs (showcase agent capabilities)
- 🔄 File Storage: Vercel Blob → Azure Blob Storage

## Simple Implementation Plan

### Week 1: tRPC Migration

#### Day 1-3: Setup tRPC
- [ ] Install tRPC dependencies (`@trpc/server`, `@trpc/client`, `@trpc/react-query`)
- [ ] Create `lib/trpc/` structure
- [ ] Set up tRPC context with existing auth and database
- [ ] Create `app/api/trpc/[trpc]/route.ts` handler

#### Day 4-5: Migrate API Routes  
- [ ] Migrate `/api/chat` → `chat.sendMessage` mutation
- [ ] Migrate `/api/history` → `chat.getHistory` query  
- [ ] Migrate `/api/vote` → `chat.vote` mutation
- [ ] Remove old API routes after testing

### Week 2: OpenAI Agent SDK Integration

#### Day 1-3: Setup Agent System
- [ ] Install OpenAI Agent SDK (`@openai/agents`, `@openai/agents-extensions`)
- [ ] **Use extensions to integrate with existing Vercel AI SDK** - keep current streaming and tools
- [ ] Create hybrid AI system (OpenAI Agents + Vercel AI SDK using extensions)
- [ ] Set up specialized agents (Resume Expert, Interview Coach, Career Planner, Job Search Advisor)
- [ ] All interactions happen within existing chat UI - no new components needed

#### Day 4-5: Agent Handoffs in Chat
- [ ] Implement smooth agent transitions within chat messages
- [ ] Add agent identity indicators in chat (e.g., "Resume Expert is now helping you...")
- [ ] Test handoffs: user asks about resume → automatically routes to Resume Expert
- [ ] Test context preservation during handoffs

### Week 3: TanStack Query + Azure Storage

#### Day 1-3: TanStack Query Migration  
- [ ] Install TanStack Query v5 (`@tanstack/react-query`)
- [ ] Replace SWR in `components/chat.tsx` and `components/sidebar-history.tsx`
- [ ] Add optimistic updates and infinite scroll
- [ ] Test real-time message updates

#### Day 4-5: Azure Blob Storage + Final Testing
- [ ] Replace Vercel Blob with Azure Blob Storage for file uploads
- [ ] Update file upload/download logic
- [ ] Run Playwright tests and fix any issues
- [ ] Deploy and test complete user journey

## Database Schema (Keep As-Is)

Current schema is perfect for PRD requirements:
- `User` - handles authentication
- `Chat` - chat sessions with title, userId (exactly what PRD asks for)
- `Message_v2` - messages with parts, attachments (supports rich content)
- `Vote_v2` - message voting (good feature to keep)
- `Document` - document handling (useful for career docs)

**No database changes needed!** ✅

## Key Implementation Details

### tRPC Setup Example
```typescript
// lib/trpc/routers/chat.ts - Simple migration from existing API
export const chatRouter = createTRPCRouter({
  getHistory: protectedProcedure
    .query(async ({ ctx }) => {
      // Use existing database queries
      return await getChatsByUserId({ userId: ctx.session.user.id });
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      chatId: z.string(),
      content: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Use existing AI integration, just change the prompt
      return await sendChatMessage(input.chatId, input.content);
    }),
});
```

### OpenAI Agent SDK Integration (Chat-Based) with Vercel AI SDK Extensions
```typescript
// lib/ai/agents/career-system.ts - Hybrid system using extensions
import { Agent, run } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions'; // Key extension for Vercel AI SDK
import { openai } from 'ai/openai';

export class CareerCounselingSystem {
  private agents = {
    triage: new Agent({
      name: 'Career Counselor',
      instructions: `You are a career counseling triage specialist. Based on user questions, 
      route them to the appropriate specialist by using handoffs. Always announce the handoff 
      in the chat like "Let me connect you with our Resume Expert who can help you better..."`,
      handoffs: ['resume_expert', 'interview_coach', 'career_planner', 'job_search_advisor'],
      model: aisdk(openai('gpt-4o-mini')) // Extension bridges OpenAI Agents + Vercel AI SDK
    }),
    
    resume_expert: new Agent({
      name: 'Resume Expert',
      instructions: `You are a professional resume expert. Help users with resume writing, 
      formatting, ATS optimization, and resume reviews. When done, offer to connect them 
      with other specialists if needed.`,
      handoffs: ['interview_coach', 'job_search_advisor'],
      model: aisdk(openai('gpt-4o')) // Uses Vercel AI SDK models via extension
    }),
    
    interview_coach: new Agent({
      name: 'Interview Coach', 
      instructions: `You are an interview preparation specialist. Help with mock interviews,
      common questions, behavioral questions, and interview strategies.`,
      handoffs: ['resume_expert', 'job_search_advisor'],
      model: aisdk(openai('gpt-4o'))
    }),
    
    career_planner: new Agent({
      name: 'Career Planning Specialist',
      instructions: `You help with career transitions, skill development, career paths,
      and long-term career strategy.`,
      handoffs: ['resume_expert', 'job_search_advisor'],
      model: aisdk(openai('gpt-4o'))
    }),
    
    job_search_advisor: new Agent({
      name: 'Job Search Advisor',
      instructions: `You help with job search strategies, networking, application tracking,
      and job market insights.`,
      handoffs: ['resume_expert', 'interview_coach'],
      model: aisdk(openai('gpt-4o'))
    })
  };

  // Integrates with existing Vercel AI SDK streaming and tools
  async handleConversation(chatId: string, message: string) {
    const response = await run(this.agents.triage, message, {
      // Keeps existing streaming, tools, and chat functionality
      streamingMode: true,
      tools: existingVercelAITools // Document creation, weather, etc.
    });
    return response; // Seamlessly works with existing chat UI
  }
}
```

### Azure Blob Storage Migration
```typescript
// lib/storage/azure.ts - Replace Vercel Blob
import { BlobServiceClient } from '@azure/storage-blob';

export async function uploadFileToAzure(file: File) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING!
  );
  const containerClient = blobServiceClient.getContainerClient('uploads');
  const blockBlobClient = containerClient.getBlockBlobClient(file.name);
  
  await blockBlobClient.uploadData(await file.arrayBuffer());
  return blockBlobClient.url;
}
```

## Success Criteria (Updated)

**Week 1 Complete:**
- [ ] tRPC working for all chat operations
- [ ] No breaking changes to existing UI

**Week 2 Complete:**  
- [ ] OpenAI Agent SDK integrated with chat-based handoffs
- [ ] Agents can smoothly hand off within chat: "Let me connect you with our Resume Expert..."
- [ ] User asks "help with resume" → automatically routes to Resume Expert
- [ ] User asks "interview tips" → routes to Interview Coach
- [ ] All happens within existing chat UI (no new components)

**Week 3 Complete:**
- [ ] TanStack Query replaces SWR completely  
- [ ] Azure Blob Storage replaces Vercel Blob
- [ ] Chat history with infinite scroll working
- [ ] File uploads working with Azure
- [ ] Deployed and tested

**Result:** A career counseling chatbot that showcases OpenAI Agent SDK capabilities with seamless handoffs, all within the simple chat interface! 🎉

---

**Total Time: 3 weeks**

This plan shows off the OpenAI Agent SDK's handoff capabilities while keeping the UI simple - everything happens in chat. Users get specialized help (resume expert, interview coach, etc.) but through natural conversation flow, not separate UI components.