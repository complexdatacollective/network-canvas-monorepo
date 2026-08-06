import 'server-only';
import { createId } from '@paralleldrive/cuid2';

import { env } from '~/env';
import { prisma } from '~/lib/db';

export const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_ACTIVE_PERIOD_MS = 1000 * 60 * 60 * 24; // 24 hours
const SESSION_IDLE_PERIOD_MS = 1000 * 60 * 60 * 24 * 14; // 2 weeks

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

/**
 * COOKIE_SECURE overrides the default when set (e.g. 'false' for test servers
 * on http://localhost where WebKit rejects Secure cookies over plain HTTP).
 * String comparison handles both validated (boolean) and unvalidated (string) env.
 */
function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure:
      env.COOKIE_SECURE !== undefined
        ? String(env.COOKIE_SECURE) !== 'false'
        : env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_IDLE_PERIOD_MS / 1000,
  };
}

/**
 * Creates the session row and returns what a cookie store needs to write it.
 * Everything here is framework-agnostic; the caller supplies cookie access,
 * which is the only part that differs between Next's `next/headers` and
 * TanStack Start's `@tanstack/react-start/server`.
 */
export async function createSession(userId: string) {
  const sessionId = createId();
  const now = Date.now();

  await prisma.session.create({
    data: {
      id: sessionId,
      user_id: userId,
      // NOTE: sessions currently have a fixed lifetime. resolveSession below
      // only checks idle_expires (a fixed 14 days from issuance) and does not
      // slide it on activity, so active_expires is retained for the
      // Lucia-compatible schema but is not yet enforced.
      active_expires: BigInt(now + SESSION_ACTIVE_PERIOD_MS),
      idle_expires: BigInt(now + SESSION_IDLE_PERIOD_MS),
    },
  });

  return { sessionId, cookieOptions: sessionCookieOptions() };
}

export type ResolvedSession = {
  sessionId: string;
  user: { userId: string; username: string };
};

/**
 * Looks a session id up and expires it if stale. Returns null when the caller
 * should be treated as unauthenticated.
 */
export async function resolveSession(
  sessionId: string | undefined,
): Promise<ResolvedSession | null> {
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) return null;

  if (session.idle_expires < BigInt(Date.now())) {
    // Session already expired; delete is best-effort (may already be removed)
    await prisma.session
      .delete({ where: { id: sessionId } })
      .catch((_error: unknown) => undefined);
    return null;
  }

  return {
    sessionId: session.id,
    user: {
      userId: session.user_id,
      username: session.user.username,
    },
  };
}

export async function destroySession(sessionId: string) {
  await prisma.session
    .delete({ where: { id: sessionId } })
    .catch((_error: unknown) => undefined);
}
