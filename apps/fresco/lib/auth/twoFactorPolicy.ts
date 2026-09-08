import 'server-only';
import { cache } from 'react';

import { prisma } from '~/lib/db';
import { getAppSetting } from '~/queries/appSettings';

/**
 * The two facts the "Require Two-Factor Authentication" setting is judged
 * against. Only password-mode accounts are subject to it: a passkey-mode
 * account has no password for a TOTP code to protect, and Fresco treats the
 * passkey as satisfying the requirement (SECURITY.md records why, and the
 * caveat that user verification is not yet enforced on passkeys).
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
 * authentication, the account signs in with a password, and it has no verified
 * authenticator yet. Cached for the request so every guard reads one answer.
 */
export const requiresTwoFactorSetup = cache(
  async (userId: string): Promise<boolean> => {
    if (!(await getAppSetting('requireTwoFactor'))) return false;
    const { passwordMode, totpEnabled } = await getTwoFactorStatus(userId);
    return passwordMode && !totpEnabled;
  },
);
