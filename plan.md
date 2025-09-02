# Career Counseling Chat Application - Implementation Plan

## Overview

This plan outlines the step-by-step migration and enhancement of the existing chat application to become a specialized **Career Counseling Chat Application** as per the PRD requirements. The current codebase has a solid foundation with Next.js, TypeScript, Drizzle ORM, and basic chat functionality, but requires migration to modern patterns and career-specific features.

## Current Architecture Analysis

### ✅ Already Implemented
- Next.js 15 App Router with TypeScript
- PostgreSQL database with Drizzle ORM
- NextAuth authentication system
- Basic chat interface with message history
- Vercel AI SDK integration (XAI/Grok models)
- Responsive UI components
- File upload and document handling
- Real-time streaming

### 🔄 Needs Migration/Enhancement
- **API Layer**: Next.js API routes → tRPC
- **Data Fetching**: SWR → TanStack Query v5
- **AI Integration**: Add OpenAI Agent SDK alongside Vercel AI SDK
- **Career Focus**: Transform generic chat → career counseling specialist
- **Session Management**: Enhanced conversation management
- **Database Schema**: Add career-specific tables

## Implementation Strategy

### Phase 1: Foundation Migration (Week 1)

#### 1.1 tRPC Setup and API Migration
**Priority: HIGH | Estimated Time: 3-4 days**

**Tasks:**
- [ ] Install tRPC dependencies (`@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`)
- [ ] Create tRPC router structure in `lib/trpc/`
- [ ] Set up tRPC context with authentication and database
- [ ] Migrate existing API routes to tRPC procedures:
  - `/api/chat` → `chat.sendMessage` mutation
  - `/api/history` → `chat.getConversations` query
  - `/api/vote` → `chat.vote` mutation
  - `/api/suggestions` → `chat.getSuggestions` query

**Files to Create:**
```
lib/trpc/
├── init.ts           # tRPC initialization
├── context.ts        # Context with auth & db
├── routers/
│   ├── _app.ts       # Main app router
│   ├── chat.ts       # Chat procedures
│   ├── auth.ts       # Auth procedures
│   └── career.ts     # Career-specific procedures
└── react.tsx         # Client-side setup
```

**Files to Modify:**
- `app/api/trpc/[trpc]/route.ts` - New tRPC handler
- `app/layout.tsx` - Add tRPC provider
- Remove existing API routes after migration

#### 1.2 TanStack Query Integration
**Priority: HIGH | Estimated Time: 2-3 days**

**Tasks:**
- [ ] Install TanStack Query v5 (`@tanstack/react-query`)
- [ ] Replace SWR with TanStack Query in all components
- [ ] Set up query client with proper defaults
- [ ] Implement infinite queries for chat history
- [ ] Add optimistic updates for message sending
- [ ] Set up error handling and retry strategies

**Files to Create:**
```
lib/query/
├── client.ts         # Query client setup
└── keys.ts           # Query key factory
```

**Files to Modify:**
- `components/chat.tsx` - Replace useChat with tRPC queries
- `components/sidebar-history.tsx` - Use infinite queries
- All components using SWR

### Phase 2: OpenAI Agent SDK Integration (Week 2)

#### 2.1 Install and Configure OpenAI Agent SDK
**Priority: HIGH | Estimated Time: 2-3 days**

**Tasks:**
- [ ] Install OpenAI Agent SDK (`@openai/agents`, `@openai/agents-extensions`)
- [ ] Create agent system architecture
- [ ] Set up multi-agent workflow for career counseling
- [ ] Integrate with existing Vercel AI SDK using extensions
- [ ] Create specialized career counseling agents

**Files to Create:**
```
lib/ai/agents/
├── index.ts          # Agent system exports
├── career-system.ts  # Main career counseling system
├── agents/
│   ├── triage.ts     # Route users to specialists
│   ├── resume.ts     # Resume analysis specialist
│   ├── interview.ts  # Interview preparation coach
│   ├── planning.ts   # Career planning strategist
│   └── job-search.ts # Job search advisor
├── tools/
│   ├── resume-analyzer.ts
│   ├── job-market-data.ts
│   ├── skill-assessment.ts
│   └── career-planning.ts
└── types.ts          # Agent-specific types
```

#### 2.2 Enhanced AI Integration
**Priority: MEDIUM | Estimated Time: 2 days**

**Tasks:**
- [ ] Create hybrid AI system (OpenAI Agents + Vercel AI SDK)
- [ ] Implement conversation context management
- [ ] Add agent handoff capabilities
- [ ] Create career-specific prompts and instructions
- [ ] Add conversation memory and persistence

**Files to Modify:**
- `lib/ai/providers.ts` - Add OpenAI provider alongside XAI
- `lib/ai/prompts.ts` - Career counseling prompts

### Phase 3: Database Schema Enhancement (Week 2-3)

#### 3.1 Career-Specific Database Schema
**Priority: MEDIUM | Estimated Time: 2 days**

**Tasks:**
- [ ] Add career profile tables
- [ ] Extend chat schema for session categorization
- [ ] Add agent interaction tracking
- [ ] Create resume analysis storage
- [ ] Add job preferences and goals tables

**Database Changes:**
```sql
-- New tables to add to schema.ts
CREATE TABLE career_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "User"(id),
  industry VARCHAR(100),
  experience_level VARCHAR(50),
  skills TEXT[],
  goals TEXT,
  location VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chat_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES "Chat"(id),
  session_type VARCHAR(50), -- 'resume', 'interview', 'planning', etc.
  agent_used VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE resume_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "User"(id),
  chat_id UUID REFERENCES "Chat"(id),
  resume_content TEXT,
  analysis_result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 3.2 Migration Scripts
**Priority: MEDIUM | Estimated Time: 1 day**

**Tasks:**
- [ ] Create Drizzle migration files
- [ ] Update schema.ts with new tables
- [ ] Create seed data for testing
- [ ] Update database queries

### Phase 4: Career Counseling Features (Week 3-4)

#### 4.1 Specialized Chat Interface
**Priority: HIGH | Estimated Time: 3-4 days**

**Tasks:**
- [ ] Create career counseling specific UI components
- [ ] Add session type selector (Resume Help, Interview Prep, etc.)
- [ ] Implement agent status indicators
- [ ] Add progress tracking for career goals
- [ ] Create specialized input forms for different counseling types

**Files to Create:**
```
components/career/
├── session-type-selector.tsx
├── career-progress.tsx
├── resume-upload.tsx
├── interview-practice.tsx
├── career-goals-form.tsx
├── agent-status.tsx
└── career-dashboard.tsx
```

#### 4.2 Enhanced Session Management
**Priority: MEDIUM | Estimated Time: 2-3 days**

**Tasks:**
- [ ] Implement session categorization
- [ ] Add conversation threading by topic
- [ ] Create session history with categorization
- [ ] Add session analytics and insights
- [ ] Implement conversation summaries

**Files to Modify:**
- `components/sidebar-history.tsx` - Add session categorization
- `components/chat-header.tsx` - Show session type and agent

### Phase 5: Advanced Features (Week 4-5)

#### 5.1 Real-time Features Enhancement
**Priority: MEDIUM | Estimated Time: 2-3 days**

**Tasks:**
- [ ] Implement typing indicators with agent context
- [ ] Add real-time agent status updates
- [ ] Create live career coaching sessions
- [ ] Add presence indicators for different agents
- [ ] Implement real-time notifications

#### 5.2 Performance Optimization
**Priority: MEDIUM | Estimated Time: 2 days**

**Tasks:**
- [ ] Implement efficient caching strategies
- [ ] Add query optimization for career data
- [ ] Create background sync for career updates
- [ ] Add offline support for career planning
- [ ] Implement intelligent prefetching

### Phase 6: Testing and Polish (Week 5-6)

#### 6.1 Comprehensive Testing
**Priority: HIGH | Estimated Time: 3-4 days**

**Tasks:**
- [ ] Create unit tests for tRPC procedures
- [ ] Add integration tests for agent workflows
- [ ] Test career counseling conversation flows
- [ ] Performance testing for real-time features
- [ ] End-to-end testing for complete user journeys

#### 6.2 Documentation and Deployment Prep
**Priority: MEDIUM | Estimated Time: 2 days**

**Tasks:**
- [ ] Update README with new architecture
- [ ] Create API documentation for tRPC
- [ ] Document agent workflows and capabilities
- [ ] Create deployment guide
- [ ] Update environment variable documentation

## Detailed Implementation Steps

### Step 1: tRPC Router Creation (Day 1-2)

```typescript
// lib/trpc/routers/chat.ts
export const chatRouter = createTRPCRouter({
  getConversations: protectedProcedure
    .query(async ({ ctx }) => {
      return await getConversationsByUserId({ userId: ctx.session.user.id });
    }),

  getMessages: protectedProcedure
    .input(z.object({
      conversationId: z.string(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(50).default(20)
    }))
    .query(async ({ input, ctx }) => {
      return await getMessagesPaginated(input);
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.string(),
      content: z.string(),
      sessionType: z.enum(['resume', 'interview', 'planning', 'general'])
    }))
    .mutation(async ({ input, ctx }) => {
      // Use OpenAI Agent SDK for response generation
      const response = await careerCounselingSystem.handleConversation(
        input.conversationId,
        input.content,
        ctx.userProfile
      );
      
      return response;
    }),
});
```

### Step 2: OpenAI Agent System Setup (Day 3-5)

```typescript
// lib/ai/agents/career-system.ts
export class CareerCounselingSystem {
  private agents: Record<string, Agent>;
  
  constructor() {
    this.agents = {
      triage: new Agent({
        name: 'Career Triage Specialist',
        instructions: `Route users to appropriate specialists based on their needs...`,
        handoffs: ['resume_specialist', 'interview_coach', 'career_planner'],
        model: aisdk(openai('gpt-4o-mini'))
      }),
      
      resume_specialist: new Agent({
        name: 'Resume Expert',
        instructions: `Expert in resume analysis and optimization...`,
        tools: [resumeAnalysisTool, atsCompatibilityTool],
        model: aisdk(openai('gpt-4o'))
      }),
      
      // ... other agents
    };
  }

  async handleConversation(sessionId: string, message: string, userProfile: CareerProfile) {
    // Intelligent agent routing and conversation handling
    const result = await run(this.agents.triage, message, {
      context: { sessionId, userProfile }
    });
    
    return result;
  }
}
```

### Step 3: TanStack Query Migration (Day 6-8)

```typescript
// Replace SWR usage in components/chat.tsx
export function Chat({ id, initialMessages, session }: ChatProps) {
  const utils = trpc.useUtils();
  
  // Replace useChat with tRPC mutations and queries
  const { data: messages, fetchNextPage, hasNextPage } = trpc.chat.getMessages.useInfiniteQuery(
    { conversationId: id, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialData: { pages: [{ items: initialMessages, nextCursor: undefined }] }
    }
  );

  const sendMessageMutation = trpc.chat.sendMessage.useMutation({
    onMutate: async (newMessage) => {
      // Optimistic update
      await utils.chat.getMessages.cancel({ conversationId: id });
      
      utils.chat.getMessages.setInfiniteData(
        { conversationId: id },
        (old) => ({
          ...old,
          pages: [
            {
              ...old.pages[0],
              items: [optimisticMessage, ...old.pages[0].items]
            },
            ...old.pages.slice(1)
          ]
        })
      );
    },
    
    onSettled: () => {
      utils.chat.getMessages.invalidate({ conversationId: id });
    }
  });

  // ... rest of component logic
}
```

## Success Metrics

### Technical Metrics
- [ ] All API endpoints migrated to tRPC (100%)
- [ ] SWR completely replaced with TanStack Query (100%)
- [ ] OpenAI Agent SDK integration functional (100%)
- [ ] Type safety maintained across all changes (100%)
- [ ] Performance improvement in data fetching (>20% faster)

### Feature Metrics
- [ ] Career counseling conversation flows working
- [ ] Multi-agent handoffs functional
- [ ] Session categorization implemented
- [ ] Resume analysis feature operational
- [ ] Interview preparation feature operational
- [ ] Career planning feature operational

### Quality Metrics
- [ ] Test coverage > 80%
- [ ] No TypeScript errors
- [ ] All Playwright tests passing
- [ ] Performance tests passing
- [ ] Security audit clean

## Risk Mitigation

### High-Risk Areas
1. **Data Migration**: Ensure no chat history is lost during tRPC migration
   - **Mitigation**: Implement gradual rollout, maintain API compatibility during transition

2. **Agent Integration Complexity**: OpenAI Agent SDK + Vercel AI SDK integration
   - **Mitigation**: Start with simple agents, gradually add complexity

3. **Performance Impact**: Additional AI calls and agent processing
   - **Mitigation**: Implement caching, optimize query patterns, use streaming

### Contingency Plans
1. **Rollback Strategy**: Keep existing API routes until tRPC is fully tested
2. **Gradual Migration**: Feature flags for enabling new functionality
3. **Performance Monitoring**: Real-time monitoring of response times and error rates

## Post-Implementation Checklist

### Technical Validation
- [ ] All tRPC procedures tested and documented
- [ ] TanStack Query patterns optimized for chat use case
- [ ] OpenAI Agent workflows validated
- [ ] Database migrations successfully applied
- [ ] Real-time features working correctly

### User Experience Validation
- [ ] Career counseling conversations feel natural
- [ ] Agent handoffs are smooth and contextual
- [ ] Session management is intuitive
- [ ] Performance meets expectations (<2s response time)
- [ ] Mobile experience optimized

### Deployment Readiness
- [ ] Environment variables configured
- [ ] Database migrations ready for production
- [ ] Monitoring and logging configured
- [ ] Error handling comprehensive
- [ ] Documentation complete

## Next Steps After Implementation

1. **User Testing**: Conduct extensive testing with career counseling scenarios
2. **AI Model Fine-tuning**: Optimize agent prompts based on user interactions
3. **Feature Enhancement**: Add advanced career features based on user feedback
4. **Performance Optimization**: Continuous monitoring and optimization
5. **Scale Preparation**: Prepare for increased usage and concurrent sessions

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1 | Week 1 | tRPC + TanStack Query migration |
| Phase 2 | Week 2 | OpenAI Agent SDK integration |
| Phase 3 | Week 2-3 | Database schema enhancement |
| Phase 4 | Week 3-4 | Career counseling features |
| Phase 5 | Week 4-5 | Advanced features |
| Phase 6 | Week 5-6 | Testing and polish |

**Total Estimated Time: 5-6 weeks**

This plan provides a comprehensive roadmap for transforming the existing chat application into a specialized, production-ready career counseling platform that meets all PRD requirements while maintaining code quality and user experience standards.