import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';

import { appRouter } from './routers/_app';
import { createContext } from './context';

/**
 * This wraps the `createContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const createCaller = cache(async () => {
  return appRouter.createCaller(
    await createContext({
      req: {
        headers: await headers(),
      },
    } as any)
  );
});

export { createCaller as api };