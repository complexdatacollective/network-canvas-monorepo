import 'server-only';
import { cache } from 'react';

import { env } from '~/env';
import { prisma } from '~/lib/db';
import { isAppConfigured } from '~/queries/appSettings';

/**
 * Whether this installation requires two-factor authentication of every
 * password account (`REQUIRE_TWO_FACTOR`). It is an environment variable
 * rather than an app setting because every Fresco account is an equal
 * administrator: a requirement that could be switched off from the dashboard
 * could be switched off by any of them, and would guarantee nothing.
 */
export function isTwoFactorRequired(): boolean {
  return env.REQUIRE_TWO_FACTOR === true;
}

/**
 * The two facts the requirement is judged against. Only password-mode
 * accounts are subject to it: a passkey-mode account has no password for a
 * TOTP code to protect, and Fresco treats the passkey as satisfying the
 * requirement (SECURITY.md records why, and the caveat that user verification
 * is not yet enforced on passkeys).
 */
export async function getTwoFactorStatus(userId: string) {
  const [key, credential] = await Promise.all([
    prisma.key.findFirst({
      where: { user_id: userId },
      select: { hashed_password: true },
    }),
    prisma.totpCredential.findFirst({
      where: { user_id: userId, verified: true },
      select: { id: true },
    }),
  ]);

  return {
    passwordMode: !!key?.hashed_password,
    totpEnabled: !!credential,
  };
}

/**
 * Whether the account has to complete two-factor setup before it may use
 * anything except the setup flow itself: the installation requires two-factor
 * authentication, setup is complete, the account signs in with a password, and
 * it has no verified authenticator yet. Cached for the request so every guard
 * reads one answer.
 *
 * Not enforced until the app is configured: the first account is created
 * part-way through the setup wizard, whose remaining steps run under that
 * session. It is asked to set up two-factor authentication on its way to the
 * dashboard instead.
 */
export const requiresTwoFactorSetup = cache(
  async (userId: string): Promise<boolean> => {
    if (!isTwoFactorRequired()) return false;
    if (!(await isAppConfigured())) return false;
    const { passwordMode, totpEnabled } = await getTwoFactorStatus(userId);
    return passwordMode && !totpEnabled;
  },
);
