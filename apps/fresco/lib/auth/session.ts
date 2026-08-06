import 'server-only';
import { cookies } from 'next/headers';

import { createSession, SESSION_COOKIE_NAME } from './sessionCore';

export { SESSION_COOKIE_NAME };

export async function createSessionCookie(userId: string) {
  const { sessionId, cookieOptions } = await createSession(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, cookieOptions);
}
