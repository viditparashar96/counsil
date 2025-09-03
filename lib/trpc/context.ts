import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import type { Session } from 'next-auth';

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 */
export interface Context {
  session: Session | null;
  db: any; // Will be imported dynamically in server context
  headers: Headers;
}

/**
 * This helper creates the context for tRPC requests from Next.js
 */
export async function createContext({
  req,
}: FetchCreateContextFnOptions): Promise<Context> {
  // Dynamic imports to avoid client-side bundling
  const { auth } = await import('@/app/(auth)/auth');
  const { db } = await import('@/lib/db');
  
  const session = await auth();

  return {
    session,
    db,
    headers: req.headers,
  };
}

/**
 * Context type inference helper for router
 */
export type CreateContext = typeof createContext;