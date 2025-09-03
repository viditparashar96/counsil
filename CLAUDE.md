# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Career Counseling Chat Application** built with Next.js 15, TypeScript, and modern web technologies. The application serves as an AI-powered career counselor that helps users with resume analysis, interview preparation, career planning, and job search advice.

## Development Commands

### Core Development
- `pnpm dev` - Start development server with turbo mode
- `pnpm build` - Run database migrations and build for production
- `pnpm start` - Start production server

### Code Quality
- `pnpm lint` - Run Next.js ESLint and Biome linter with auto-fix
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm format` - Format code using Biome

### Database Operations
- `pnpm db:generate` - Generate Drizzle schema migrations
- `pnpm db:migrate` - Run database migrations manually
- `pnpm db:studio` - Open Drizzle Studio for database GUI
- `pnpm db:push` - Push schema changes to database
- `pnpm db:pull` - Pull schema from database
- `pnpm db:check` - Validate migration files
- `pnpm db:up` - Apply migrations

### Testing
- `pnpm test` - Run Playwright tests (sets PLAYWRIGHT=True environment variable)

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15 App Router with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: NextAuth.js v5 (beta)
- **AI Integration**: Vercel AI SDK with xAI/Grok models + OpenAI Agent SDK
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: SWR for data fetching (planned migration to TanStack Query)
- **UI Components**: Radix UI primitives with custom styling
- **Code Editor**: CodeMirror 6 for in-app code editing
- **Rich Text**: ProseMirror for document editing

### Project Structure

```
app/
├── (auth)/           # Authentication routes and logic
│   ├── login/        # Login page
│   ├── register/     # Registration page
│   └── api/auth/     # Auth API routes
├── (chat)/           # Main chat application
│   ├── api/          # Chat API endpoints
│   ├── chat/[id]/    # Individual chat pages
│   └── page.tsx      # Main chat interface
└── layout.tsx        # Root layout with providers

components/
├── ui/               # shadcn/ui components
├── elements/         # Chat-specific elements
├── artifact*.tsx     # Document/artifact handling
├── chat*.tsx         # Chat interface components
├── sidebar*.tsx      # Sidebar components
└── *.tsx            # Other reusable components

lib/
├── ai/               # AI integration and tools
│   ├── tools/        # AI function tools
│   ├── models.ts     # Model configurations
│   ├── providers.ts  # AI provider setup
│   └── prompts.ts    # System prompts
├── db/               # Database layer
│   ├── migrations/   # Drizzle migrations
│   ├── schema.ts     # Database schema
│   ├── queries.ts    # Database queries
│   └── migrate.ts    # Migration runner
└── editor/           # Text editor configurations
```

### Database Schema

- **User**: Basic user authentication (id, email, password)
- **Chat**: Chat sessions with visibility settings
- **Message_v2**: Modern message structure with parts and attachments
- **Vote_v2**: Message voting system
- **Document**: Collaborative documents (text, code, image, sheet)
- **Suggestion**: Document editing suggestions
- **Stream**: Chat streaming sessions

Note: Legacy Message and Vote tables are deprecated.

### AI System

The application uses a hybrid AI approach:
1. **Vercel AI SDK** for real-time streaming and tool calling
2. **xAI/Grok models** as primary AI providers via AI Gateway
3. **OpenAI Agent SDK** integration planned for specialized career counseling agents

Current AI tools:
- Document creation and updates
- Weather information
- Suggestion requests

### Authentication

Uses NextAuth.js v5 with:
- Email/password authentication
- Guest user support
- Session management
- Protected routes via middleware

## Development Guidelines

### Database Changes
1. Modify `lib/db/schema.ts` for schema changes
2. Run `pnpm db:generate` to create migration files
3. Run `pnpm db:migrate` to apply changes
4. Use `pnpm db:studio` for visual database management

### Adding AI Tools
1. Create tool files in `lib/ai/tools/`
2. Export tools from `lib/ai/tools/index.ts`
3. Configure in AI provider setup
4. Test with streaming responses

### Component Development
- Follow shadcn/ui patterns for new UI components
- Use TypeScript strictly throughout
- Implement proper loading and error states
- Follow existing naming conventions

### API Development
- Current: Next.js API routes in `app/(chat)/api/`
- Planned: Migration to tRPC for type-safe APIs
- Use Zod for input validation
- Implement proper error handling

## Environment Variables

Required for development:
- `POSTGRES_URL` - PostgreSQL database connection
- `AUTH_SECRET` - NextAuth secret key
- `AI_GATEWAY_API_KEY` - For non-Vercel deployments
- Additional AI provider keys as needed

## Migration Plans

This codebase is in transition to become a specialized career counseling platform:

1. **API Migration**: Next.js routes → tRPC
2. **Data Fetching**: SWR → TanStack Query v5  
3. **AI Enhancement**: Add OpenAI Agent SDK alongside Vercel AI SDK
4. **Career Focus**: Specialized agents for resume analysis, interview prep, career planning
5. **Enhanced Schema**: Career profile tables and session categorization

## Testing

- Uses Playwright for end-to-end testing
- Tests located alongside components when applicable
- Run tests with `pnpm test`
- Environment variable `PLAYWRIGHT=True` is set automatically

## Deployment

- Optimized for Vercel deployment
- Database migrations run automatically during build
- Uses AI Gateway for model access (automatic auth on Vercel)
- Supports both Vercel and non-Vercel deployments

## Code Quality Tools

- **Biome**: Fast linter and formatter (replaces ESLint + Prettier)
- **TypeScript**: Strict mode enabled
- **ESLint**: Additional Next.js specific rules
- Both tools run on `pnpm lint` command