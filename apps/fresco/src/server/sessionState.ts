import { createServerFn } from '@tanstack/react-start';

/**
 * The session read that route guards need. It exists as a server function
 * because `beforeLoad` and `loader` are isomorphic — Prisma and Start's cookie
 * helpers cannot be called from either directly.
 *
 * It deliberately returns only what a guard needs, so no session row or user
 * record is serialised into the client payload.
 *
 * The session module is imported inside the handler. The plugin splits the
 * handler body out for the server build but leaves the rest of this module in
 * the client build, and a top-level import of a side-effectful server module
 * (`lib/db` constructs a `PrismaClient` at module scope) is therefore not
 * shaken out. See `src/server/middleware.ts` for the same hazard in a
 * middleware.
 */
export const getSessionState = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getServerSession } = await import('~/src/server/session');
    const session = await getServerSession();
    return {
      signedIn: session !== null,
      username: session?.user.username ?? null,
    };
  },
);
