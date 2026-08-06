import { createMiddleware } from '@tanstack/react-start';

/**
 * Replaces the ~60 hand-repeated `requireApiAuth()` calls in `actions/`. Every
 * one of those is a place to forget; this is one place that cannot be
 * forgotten, and it puts the session in the handler's context typed.
 *
 * The session module is imported *inside* `.server()` rather than at the top of
 * this file, and that is load-bearing rather than stylistic.
 *
 * A `createMiddleware` chain is a value that both environments reference: the
 * client keeps it so it can run any `.client()` links. Unlike a
 * `createServerFn` handler, its module graph is therefore not split, so a
 * top-level `import` here reaches the browser build. Because
 * `lib/auth/sessionCore.ts` transitively constructs a `PrismaClient` at module
 * scope, that import is side-effectful and survives tree-shaking even when the
 * binding it provides is unused.
 *
 * The observable result of getting this wrong is Prisma, the database URL
 * handling, and the whole app-settings tree in the client bundle. Start's
 * Import Protection catches it — that is how it was found — but the build error
 * names the leaked module rather than the middleware that pulled it in.
 */
export const authed = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const { getServerSession } = await import('~/src/server/session');
    const session = await getServerSession();
    if (!session) throw new Error('Unauthorized');
    return next({ context: { session } });
  },
);
