import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import 'server-only';

import { prisma } from '~/lib/db';

import { TWO_FACTOR_SETUP_PATH } from './paths';
import { SESSION_COOKIE_NAME } from './session';
import { requiresTwoFactorSetup } from './twoFactorPolicy';

export const getServerSession = cache(async () => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
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
      locale: session.user.locale,
    },
  };
});

/**
 * Page guard. A signed-in account that still has to set up mandatory
 * two-factor authentication is sent to the setup page instead of the page it
 * asked for, so no dashboard route renders for it.
 */
export async function requirePageAuth() {
  const session = await getServerSession();

  if (!session) {
    redirect('/signin');
  }

  if (await requiresTwoFactorSetup(session.user.userId)) {
    redirect(TWO_FACTOR_SETUP_PATH);
  }

  return session;
}

type ApiAuthOptions = {
  /**
   * Admit an account that still has to set up mandatory two-factor
   * authentication. Only the actions that perform that setup pass this;
   * everything else the session could reach stays closed until it is done.
   */
  allowPendingTwoFactorSetup?: boolean;
};

export async function requireApiAuth({
  allowPendingTwoFactorSetup = false,
}: ApiAuthOptions = {}) {
  const session = await getServerSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  if (
    !allowPendingTwoFactorSetup &&
    (await requiresTwoFactorSetup(session.user.userId))
  ) {
    throw new Error('Two-factor authentication setup required');
  }

  return session;
}
