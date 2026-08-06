import 'server-only';
import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import {
  hashRecoveryCode,
  verifyTotpCode,
  verifyTwoFactorToken,
} from '~/lib/auth/totp';
import { prisma } from '~/lib/db';
import { checkRateLimit, recordLoginAttempt } from '~/lib/rateLimit';
import { getInstallationId } from '~/queries/appSettings';
import { verifyTwoFactorSchema } from '~/schemas/totp';

const TOTP_CODE_PATTERN = /^\d{6}$/;
const RECOVERY_CODE_PATTERN = /^[0-9a-f]{20}$/;

/**
 * The framework-independent half of `verifyTwoFactor`. Like `loginCore`, it
 * takes the client IP rather than reading headers, and returns the intent to
 * establish a session rather than writing the cookie itself.
 *
 * `usedRecoveryCode` distinguishes the two activity-feed messages the callers
 * record.
 */
export type TwoFactorCoreResult =
  | {
      authenticated: true;
      userId: string;
      username: string;
      usedRecoveryCode: boolean;
    }
  | { authenticated: false; result: FormSubmissionResult };

export async function verifyTwoFactorCore(
  data: unknown,
  ipAddress: string | null,
): Promise<TwoFactorCoreResult> {
  const fail = (message: string): TwoFactorCoreResult => ({
    authenticated: false,
    result: { success: false, formErrors: [message] },
  });

  const parsed = verifyTwoFactorSchema.safeParse(data);
  if (!parsed.success) return fail('Invalid submission');

  const { twoFactorToken, code } = parsed.data;

  const installationId = await getInstallationId();
  if (!installationId) {
    return fail('Server configuration error. Please contact an admin.');
  }

  const tokenResult = verifyTwoFactorToken(twoFactorToken, installationId);
  if (!tokenResult.valid) {
    return fail('Two-factor session expired. Please sign in again.');
  }

  const { userId } = tokenResult;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  if (!user) return fail('User not found');

  const rateLimitResult = await checkRateLimit(user.username, ipAddress);
  if (!rateLimitResult.allowed) {
    return fail('Too many attempts. Please sign in again.');
  }

  const credential = await prisma.totpCredential.findFirst({
    where: { user_id: userId, verified: true },
  });

  if (!credential) return fail('Two-factor authentication is not configured');

  if (TOTP_CODE_PATTERN.test(code)) {
    if (!verifyTotpCode(credential.secret, code)) {
      await recordLoginAttempt(user.username, ipAddress, false);
      return fail('Invalid verification code');
    }

    return {
      authenticated: true,
      userId,
      username: user.username,
      usedRecoveryCode: false,
    };
  }

  if (RECOVERY_CODE_PATTERN.test(code)) {
    const { count } = await prisma.recoveryCode.updateMany({
      where: {
        user_id: userId,
        codeHash: hashRecoveryCode(code),
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    if (count === 0) {
      await recordLoginAttempt(user.username, ipAddress, false);
      return fail('Invalid recovery code');
    }

    return {
      authenticated: true,
      userId,
      username: user.username,
      usedRecoveryCode: true,
    };
  }

  void recordLoginAttempt(user.username, ipAddress, false);
  return fail('Invalid code format');
}
