# tRPC Integration Example

## 1. Update Root Layout

Update your `app/layout.tsx` to include the tRPC provider:

```tsx
import { Toaster } from 'sonner';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { TRPCReactProvider } from '@/lib/trpc/react'; // Add this import

import './globals.css';
import { SessionProvider } from 'next-auth/react';

export const metadata: Metadata = {
  metadataBase: new URL('https://chat.vercel.ai'),
  title: 'Next.js Chatbot Template',
  description: 'Next.js chatbot template using the AI SDK.',
};

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
};

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
});

const LIGHT_THEME_COLOR = 'hsl(0 0% 100%)';
const DARK_THEME_COLOR = 'hsl(240deg 10% 3.92%)';
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SessionProvider>
            <TRPCReactProvider> {/* Wrap with tRPC provider */}
              <Toaster position="top-center" />
              {children}
            </TRPCReactProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

## 2. Example: Converting History Component

Here's how you might convert a component that currently fetches chat history using fetch to use tRPC:

### Before (using fetch)
```tsx
'use client';

import { useEffect, useState } from 'react';

interface Chat {
  id: string;
  title: string;
  createdAt: Date;
}

export function ChatHistory() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await fetch('/api/history?limit=20');
        if (!response.ok) {
          throw new Error('Failed to fetch chats');
        }
        const data = await response.json();
        setChats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {chats.map((chat) => (
        <div key={chat.id}>{chat.title}</div>
      ))}
    </div>
  );
}
```

### After (using tRPC)
```tsx
'use client';

import { api } from '@/lib/trpc';

export function ChatHistory() {
  const { 
    data: chats, 
    isLoading, 
    error,
    refetch 
  } = api.history.getChats.useQuery({
    limit: 20,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <button onClick={() => refetch()}>
        Refresh
      </button>
      {chats?.map((chat) => (
        <div key={chat.id}>{chat.title}</div>
      ))}
    </div>
  );
}
```

## 3. Example: Document Operations

### Document Editor with tRPC
```tsx
'use client';

import { api } from '@/lib/trpc';
import { useState } from 'react';

interface DocumentEditorProps {
  documentId: string;
}

export function DocumentEditor({ documentId }: DocumentEditorProps) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');

  // Fetch document
  const { 
    data: documents, 
    isLoading 
  } = api.document.getById.useQuery({ 
    id: documentId 
  }, {
    onSuccess: (data) => {
      const document = data[0];
      if (document) {
        setContent(document.content || '');
        setTitle(document.title || '');
      }
    }
  });

  // Save document mutation
  const saveDocument = api.document.save.useMutation({
    onSuccess: () => {
      console.log('Document saved successfully');
    },
    onError: (error) => {
      console.error('Save failed:', error.message);
    }
  });

  const handleSave = async () => {
    await saveDocument.mutateAsync({
      id: documentId,
      content,
      title,
      kind: 'text',
    });
  };

  if (isLoading) return <div>Loading document...</div>;

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Document title"
        className="w-full p-2 border rounded"
      />
      
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Document content"
        rows={10}
        className="w-full p-2 border rounded"
      />
      
      <button 
        onClick={handleSave} 
        disabled={saveDocument.isLoading}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {saveDocument.isLoading ? 'Saving...' : 'Save Document'}
      </button>
    </div>
  );
}
```

## 4. Example: Voting Component

```tsx
'use client';

import { api } from '@/lib/trpc';

interface VotingComponentProps {
  chatId: string;
  messageId: string;
}

export function VotingComponent({ chatId, messageId }: VotingComponentProps) {
  // Get current votes
  const { data: votes } = api.vote.getVotes.useQuery({ chatId });
  
  // Vote mutation
  const voteMessage = api.vote.voteMessage.useMutation({
    onSuccess: () => {
      // Invalidate votes query to refetch
      api.vote.getVotes.invalidate({ chatId });
    }
  });

  const handleVote = (type: 'up' | 'down') => {
    voteMessage.mutate({
      chatId,
      messageId,
      type,
    });
  };

  const currentVote = votes?.find(vote => vote.messageId === messageId);

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleVote('up')}
        disabled={voteMessage.isLoading}
        className={`px-2 py-1 rounded ${
          currentVote?.type === 'up' 
            ? 'bg-green-500 text-white' 
            : 'bg-gray-200'
        }`}
      >
        👍
      </button>
      
      <button
        onClick={() => handleVote('down')}
        disabled={voteMessage.isLoading}
        className={`px-2 py-1 rounded ${
          currentVote?.type === 'down' 
            ? 'bg-red-500 text-white' 
            : 'bg-gray-200'
        }`}
      >
        👎
      </button>
    </div>
  );
}
```

## 5. Server-Side Usage

### Using tRPC in Server Components
```tsx
// app/dashboard/page.tsx
import { api } from '@/lib/trpc/server';

export default async function DashboardPage() {
  // Direct server-side calls
  const chats = await api.history.getChats({ limit: 5 });

  return (
    <div>
      <h1>Recent Chats</h1>
      <div className="space-y-2">
        {chats.map((chat) => (
          <div key={chat.id} className="p-3 border rounded">
            <h3 className="font-semibold">{chat.title}</h3>
            <p className="text-sm text-gray-500">
              {new Date(chat.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Benefits of This Migration

1. **Type Safety**: All API calls are fully typed
2. **Auto-completion**: IDE provides suggestions for all procedures
3. **Error Handling**: Structured error handling with proper typing
4. **Caching**: Automatic request deduplication and caching
5. **DevTools**: Built-in React Query DevTools for debugging
6. **Optimistic Updates**: Easy to implement optimistic UI updates
7. **Batching**: Multiple requests are automatically batched

## Gradual Migration Strategy

You can migrate gradually:

1. **Keep existing API routes** for now
2. **Start using tRPC** for new components
3. **Migrate simple components** first (like the examples above)
4. **Leave complex streaming** (chat API) as REST for now
5. **Remove old API routes** once migration is complete

This approach ensures your application continues to work while you gradually adopt tRPC.