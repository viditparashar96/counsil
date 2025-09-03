import { createTRPCRouter } from '../init';
import { chatRouter } from './chat';
import { historyRouter } from './history';
import { voteRouter } from './vote';
import { documentRouter } from './document';
import { suggestionsRouter } from './suggestions';
import { uploadRouter } from './upload';
import { agentsRouter } from './agents';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/trpc should be manually added here.
 */
export const appRouter = createTRPCRouter({
  chat: chatRouter,
  history: historyRouter,
  vote: voteRouter,
  document: documentRouter,
  suggestions: suggestionsRouter,
  upload: uploadRouter,
  agents: agentsRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;