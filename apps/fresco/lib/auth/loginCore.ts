import 'server-only';
import { flattenError } from 'zod/mini';

import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { createTwoFactorToken, hashRecoveryCode } from '~/lib/auth/totp';
import { prisma } from '~/lib/db';
import { checkRateLimit, recordLoginAttempt } from '~/lib/rateLimit';
import { getInstallationId } from '~/queries/appSettings';
import { loginSchema } from '~/schemas/auth';
import { hashPassword, verifyPassword } from '~/utils/password';

type RateLimited = {
  success: false;
  rateLimited: true;
  retryAfter: number;
};

type TwoFactorRequired = {
  success: false;
  requiresTwoFactor: true;
  twoFactorToken: string;
};

export type LoginResult =
  | FormSubmissionResult
  | RateLimited
  | TwoFactorRequired;

/**
 * The framework-independent half of `login`. It never touches cookies or
 * headers: the caller reads the client IP its own way and, on
 * `{ authenticated: true }`, writes the session cookie its own way.
 *
 * Everything that makes this function security-relevant — rate limiting, the
 * dummy-hash timing equalisation, the TOTP branch — is here, so both the
 * Next.js Server Action and the TanStack Start server function share it
 * verbatim.
 */
type Authenticated = { authenticated: true; userId: string; username: string };

export type LoginCoreResult =
  | Authenticated
  | { authenticated: false; result: LoginResult };

/**
 * Recovery-code sign-in cannot produce the rate-limited or two-factor shapes,
 * so its callers can keep returning the narrower `FormSubmissionResult`.
 */
export type RecoveryLoginCoreResult =
  | Authenticated
  | { authenticated: false; result: FormSubmissionResult };

// Precomputed lazily once per server instance. Used to equalize login response
// time on the "no such user / passkey-only" path, preventing timing-based
// username enumeration.
let dummyPasswordHash: string | null = null;
async function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= await hashPassword('fresco-dummy-password-do-not-use');
  return dummyPasswordHash;
}

export async function loginCore(
  data: unknown,
  ipAddress: string | null,
): Promise<LoginCoreResult> {
  const parsedFormData = loginSchema.safeParse(data);

  if (!parsedFormData.success) {
    return {
      authenticated: false,
      result: { success: false, ...flattenError(parsedFormData.error) },
    };
  }

  const { username, password } = parsedFormData.data;

  const rateLimitResult = await checkRateLimit(username, ipAddress);
  if (!rateLimitResult.allowed) {
    return {
      authenticated: false,
      result: {
        success: false,
        rateLimited: true,
        retryAfter: rateLimitResult.retryAfter,
      },
    };
  }

  const key = await prisma.key.findUnique({
    where: { id: `username:${username}` },
  });

  if (!key?.hashed_password) {
    // Run a dummy verification so this path takes the same time as a wrong
    // password, preventing username enumeration via response timing.
    await verifyPassword(password, await getDummyPasswordHash());
    await recordLoginAttempt(username, ipAddress, false);
    return {
      authenticated: false,
      result: {
        success: false,
        formErrors: ['Incorrect username or password'],
      },
    };
  }

  const validPassword = await verifyPassword(password, key.hashed_password);

  if (!validPassword) {
    await recordLoginAttempt(username, ipAddress, false);
    return {
      authenticated: false,
      result: {
        success: false,
        formErrors: ['Incorrect username or password'],
      },
    };
  }

  await recordLoginAttempt(username, ipAddress, true);

  const totpCredential = await prisma.totpCredential.findFirst({
    where: { user_id: key.user_id, verified: true },
  });

  if (totpCredential) {
    const installationId = await getInstallationId();
    if (!installationId) {
      return {
        authenticated: false,
        result: {
          success: false,
          formErrors: ['Server configuration error. Please contact an admin.'],
        },
      };
    }
    return {
      authenticated: false,
      result: {
        success: false,
        requiresTwoFactor: true,
        twoFactorToken: createTwoFactorToken(key.user_id, installationId),
      },
    };
  }

  return { authenticated: true, userId: key.user_id, username };
}

/** The framework-independent half of `recoveryCodeLogin`. */
export async function recoveryCodeLoginCore(
  data: { username: string; recoveryCode: string },
  ipAddress: string | null,
): Promise<RecoveryLoginCoreResult> {
  const rateLimitResult = await checkRateLimit(data.username, ipAddress);
  if (!rateLimitResult.allowed) {
    return {
      authenticated: false,
      result: {
        success: false,
        formErrors: ['Too many attempts. Please try again later.'],
      },
    };
  }

  const user = await prisma.user.findUnique({
    where: { username: data.username },
    select: { id: true, username: true },
  });

  if (!user) {
    await recordLoginAttempt(data.username, ipAddress, false);
    return {
      authenticated: false,
      result: {
        success: false,
        formErrors: ['Invalid username or recovery code'],
      },
    };
  }

  const codeHash = hashRecoveryCode(data.recoveryCode);

  const { count } = await prisma.recoveryCode.updateMany({
    where: { user_id: user.id, codeHash, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (count === 0) {
    await recordLoginAttempt(data.username, ipAddress, false);
    return {
      authenticated: false,
      result: {
        success: false,
        formErrors: ['Invalid username or recovery code'],
      },
    };
  }

  await recordLoginAttempt(data.username, ipAddress, true);

  return { authenticated: true, userId: user.id, username: user.username };
}
