import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import 'server-only';

import { resolveSession, SESSION_COOKIE_NAME } from './sessionCore';

export const getServerSession = cache(async () => {
  const cookieStore = await cookies();
  return resolveSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
});

export async function requirePageAuth() {
  const session = await getServerSession();

  if (!session) {
    redirect('/signin');
  }
  return session;
}

export async function requireApiAuth() {
  const session = await getServerSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  return session;
}
