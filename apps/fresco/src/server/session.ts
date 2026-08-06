import '@tanstack/react-start/server-only';
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server';

import {
  createSession,
  destroySession,
  resolveSession,
  SESSION_COOKIE_NAME,
  type ResolvedSession,
} from '~/lib/auth/sessionCore';

/**
 * The TanStack Start half of `lib/auth/`. Every framework-independent
 * decision — the session row, its lifetime, the cookie attributes, expiry —
 * lives in `lib/auth/sessionCore.ts` and is shared with the Next.js
 * implementation in `lib/auth/session.ts` and `lib/auth/guards.ts`.
 *
 * Start's cookie helpers are synchronous and AsyncLocalStorage-backed, and are
 * not callable from an isomorphic router loader — everything here must be
 * reached through a server function or a server route handler.
 */

export async function createSessionCookie(userId: string) {
  const { sessionId, cookieOptions } = await createSession(userId);
  setCookie(SESSION_COOKIE_NAME, sessionId, cookieOptions);
}

export async function getServerSession(): Promise<ResolvedSession | null> {
  return resolveSession(getCookie(SESSION_COOKIE_NAME));
}

export async function clearSessionCookie(sessionId: string) {
  await destroySession(sessionId);
  deleteCookie(SESSION_COOKIE_NAME);
}

/**
 * There is no `requirePageAuth`/`requireApiAuth` pair here. Route guards go
 * through `getSessionState` (a server function callable from an isomorphic
 * `beforeLoad`) and server functions go through the `authed` middleware, so the
 * ~60 hand-repeated call sites collapse to two mechanisms rather than two
 * helpers.
 */
