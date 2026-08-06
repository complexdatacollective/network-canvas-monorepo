import 'server-only';
import { createHash } from 'node:crypto';

import { prisma } from '~/lib/db';

// Tokens are stored only as a SHA-256 hash so a database read (backup, replica,
// dump) does not expose usable credentials. The plaintext is shown to the
// operator exactly once, at creation time.
export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Bearer-token check for `/api/[version]/*`. Lives in `lib/` rather than
 * `actions/` because both the Next.js route handlers and the TanStack Start
 * server routes need it, and `actions/apiTokens.ts` is a `'use server'` module
 * that reaches `next/headers` through `requireApiAuth`.
 */
export async function verifyApiToken(
  token: string,
): Promise<{ valid: boolean }> {
  try {
    const apiToken = await prisma.apiToken.findUnique({
      where: { token: hashApiToken(token), isActive: true },
    });

    if (!apiToken) {
      return { valid: false };
    }

    await prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date() },
    });

    return { valid: true };
  } catch {
    return { valid: false };
  }
}
