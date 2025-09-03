# tRPC v10+ Migration Guide

This guide documents the complete migration from Next.js API routes to tRPC v10+ with full TypeScript type safety.

## Project Structure

```
lib/trpc/
├── init.ts           # tRPC initialization and procedures
├── context.ts        # Context with auth & db access
├── server.ts         # Server-side tRPC caller
├── react.tsx         # Client-side React provider
├── index.ts          # Main exports
└── routers/
    ├── _app.ts       # Main app router combining all routers
    ├── chat.ts       # Chat-related procedures
    ├── document.ts   # Document CRUD operations
    ├── vote.ts       # Message voting functionality
    ├── history.ts    # Chat history with pagination
    ├── upload.ts     # File upload procedures
    └── suggestions.ts # Document suggestions

app/api/trpc/[trpc]/route.ts  # tRPC API handler
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query @tanstack/react-query-devtools superjson
```

### 2. Wrap Your App with tRPC Provider

Update your root layout or main App component:

```tsx
// app/layout.tsx or pages/_app.tsx
import { TRPCReactProvider } from '@/lib/trpc/react';

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <TRPCReactProvider>
          {children}
        </TRPCReactProvider>
      </body>
    </html>
  );
}
```

### 3. Environment Variables

Ensure you have the following environment variables configured:
- `POSTGRES_URL` - Database connection string
- `NEXTAUTH_SECRET` - NextAuth secret key
- Any other existing environment variables

## API Migration Summary

| Original API Route | tRPC Procedure | Type | Description |
|-------------------|----------------|------|-------------|
| `GET /api/history` | `history.getChats` | Query | Paginated chat history |
| `GET /api/vote` | `vote.getVotes` | Query | Get votes by chat ID |
| `PATCH /api/vote` | `vote.voteMessage` | Mutation | Vote on messages |
| `GET /api/document` | `document.getById` | Query | Get document by ID |
| `POST /api/document` | `document.save` | Mutation | Save/update document |
| `DELETE /api/document` | `document.deleteAfterTimestamp` | Mutation | Delete documents after timestamp |
| `GET /api/suggestions` | `suggestions.getByDocumentId` | Query | Get suggestions by document ID |
| `POST /api/files/upload` | `upload.uploadFile` | Mutation | Upload files with validation |
| `DELETE /api/chat` | `chat.deleteChat` | Mutation | Delete chat by ID |
| `GET /api/chat/{id}` | `chat.getChat` | Query | Get chat by ID |

**Note:** The streaming chat endpoint (`POST /api/chat`) remains as a REST API route since it's optimized for streaming with the Vercel AI SDK. tRPC subscriptions can be added later if needed.

## Usage Examples

### Client-Side Usage

```tsx
'use client';

import { api } from '@/lib/trpc';

export function ChatHistory() {
  // Query with automatic TypeScript inference
  const { data: chats, isLoading, error } = api.history.getChats.useQuery({
    limit: 20,
  });

  // Mutation with optimistic updates
  const deleteChat = api.chat.deleteChat.useMutation({
    onSuccess: () => {
      // Invalidate and refetch chat history
      api.history.getChats.invalidate();
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {chats?.map((chat) => (
        <div key={chat.id}>
          <h3>{chat.title}</h3>
          <button 
            onClick={() => deleteChat.mutate({ id: chat.id })}
            disabled={deleteChat.isLoading}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Server-Side Usage

```tsx
// app/dashboard/page.tsx
import { api } from '@/lib/trpc/server';

export default async function Dashboard() {
  // Direct server-side calls with full type safety
  const chats = await api.history.getChats({ limit: 10 });

  return (
    <div>
      <h1>Your Chats</h1>
      {chats.map((chat) => (
        <div key={chat.id}>{chat.title}</div>
      ))}
    </div>
  );
}
```

### Document Operations

```tsx
'use client';

export function DocumentEditor({ documentId }: { documentId: string }) {
  // Fetch document
  const { data: documents } = api.document.getById.useQuery({ 
    id: documentId 
  });

  // Save document mutation
  const saveDocument = api.document.save.useMutation();

  const handleSave = async () => {
    await saveDocument.mutateAsync({
      id: documentId,
      content: 'Updated content',
      title: 'Document Title',
      kind: 'text',
    });
  };

  return (
    <div>
      {/* Document editor UI */}
      <button onClick={handleSave} disabled={saveDocument.isLoading}>
        {saveDocument.isLoading ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
```

### File Upload

```tsx
'use client';

export function FileUpload() {
  const uploadFile = api.upload.uploadFile.useMutation();

  const handleFileUpload = async (file: File) => {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const result = await uploadFile.mutateAsync({
      filename: file.name,
      contentType: file.type as 'image/jpeg' | 'image/png',
      size: file.size,
      data: base64,
    });

    console.log('Upload successful:', result);
  };

  return (
    <input
      type="file"
      accept="image/jpeg,image/png"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
      }}
    />
  );
}
```

### Error Handling

```tsx
'use client';

export function ErrorHandlingExample() {
  const { data, error, isError } = api.vote.getVotes.useQuery(
    { chatId: 'some-uuid' },
    {
      retry: 3,
      onError: (error) => {
        if (error.data?.code === 'FORBIDDEN') {
          // Handle forbidden access
          console.log('Access denied');
        }
      },
    }
  );

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  return <div>{/* Render votes */}</div>;
}
```

## Key Features

### ✅ Type Safety
- End-to-end TypeScript type safety
- Automatic type inference for inputs and outputs
- Compile-time error checking

### ✅ Authentication
- Built-in NextAuth integration
- Protected procedures with session validation
- User ownership verification

### ✅ Validation
- Comprehensive Zod schemas for all inputs
- Automatic request validation
- Detailed error messages

### ✅ Error Handling
- Custom error types with proper HTTP status codes
- Structured error responses
- Client-side error boundaries

### ✅ Performance
- Request batching
- Automatic caching with React Query
- Optimistic updates

### ✅ Developer Experience
- Auto-completion in IDEs
- React Query DevTools integration
- Detailed logging in development

## Migration Strategy

### Phase 1: Setup (Completed)
- ✅ Install tRPC dependencies
- ✅ Create tRPC infrastructure
- ✅ Set up routers and procedures
- ✅ Configure API handlers

### Phase 2: Gradual Migration
1. Start using tRPC for new features
2. Migrate simple GET endpoints first
3. Update client components to use tRPC hooks
4. Keep complex streaming endpoints as REST initially

### Phase 3: Client Updates
1. Replace `fetch` calls with tRPC hooks
2. Update error handling to use tRPC error types
3. Remove old API route files after verification

### Phase 4: Advanced Features (Future)
- Add WebSocket support for real-time features
- Implement tRPC subscriptions for streaming
- Add OpenAPI generation for external APIs

## Coexistence

During migration, tRPC and REST APIs can coexist:

- **tRPC**: Use for new features and simple CRUD operations
- **REST**: Keep for complex streaming (chat), file uploads, or third-party integrations
- **Gradual**: Migrate endpoints one by one as needed

## Performance Considerations

- **Request Batching**: Multiple tRPC calls are automatically batched
- **Caching**: React Query handles caching, deduplication, and background updates
- **Bundle Size**: tRPC adds ~15KB to client bundle (acceptable trade-off for type safety)

## Troubleshooting

### Common Issues

1. **Context not available**: Ensure `TRPCReactProvider` wraps your app
2. **Type errors**: Run `npm run build` to check for type issues
3. **Database connection**: Verify `POSTGRES_URL` environment variable
4. **Authentication**: Ensure NextAuth is properly configured

### Debug Mode

Enable detailed logging in development:

```tsx
// lib/trpc/react.tsx
loggerLink({
  enabled: () => true, // Always log in development
}),
```

This migration provides a solid foundation for type-safe API development while maintaining all existing functionality and performance characteristics.