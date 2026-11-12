'use server';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { addEvent } from '~/lib/activityFeed';
import { createSessionCookie } from '~/lib/auth/session';
import {
  hashRecoveryCode,
  verifyTotpCode,
  verifyTwoFactorToken,
} from '~/lib/auth/totp';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { checkRateLimit, recordLoginAttempt } from '~/lib/rateLimit';
import { getInstallationId } from '~/queries/appSettings';
import { createTotpSchemas } from '~/schemas/totp';
import { getClientIp } from '~/utils/getClientIp';

const messages = defineMessages({
  copyInvalidSubmission: {
    id: 'fresco.actions.twoFactor.copyInvalidSubmission',
    defaultMessage: 'Invalid submission',
    description:
      'Error shown on the two-factor step of signing in when the submitted form data is malformed.',
  },
  copyServerConfigurationErrorPleaseContactAnAdmin: {
    id: 'fresco.actions.twoFactor.copyServerConfigurationErrorPleaseContactAnAdmin',
    defaultMessage: 'Server configuration error. Please contact an admin.',
    description:
      'Error shown on the two-factor step of signing in when the installation has no installation ID, so the sign-in cannot be checked. Tells the researcher to contact whoever administers the installation.',
  },
  copyTwoFactorSessionExpiredPleaseSignIn: {
    id: 'fresco.actions.twoFactor.copyTwoFactorSessionExpiredPleaseSignIn',
    defaultMessage: 'Two-factor session expired. Please sign in again.',
    description:
      'Error shown on the two-factor step of signing in when the short-lived token issued after the password step has expired or is invalid, so the researcher must start sign-in again.',
  },
  copyUserNotFound: {
    id: 'fresco.actions.twoFactor.copyUserNotFound',
    defaultMessage: 'User not found',
    description:
      'Error shown on the two-factor step of signing in when the researcher account named by the sign-in session no longer exists.',
  },
  copyTooManyAttemptsPleaseSignInAgain: {
    id: 'fresco.actions.twoFactor.copyTooManyAttemptsPleaseSignInAgain',
    defaultMessage: 'Too many attempts. Please sign in again.',
    description:
      'Error shown on the two-factor step of signing in when the account or network address has made too many failed sign-in attempts and is temporarily rate limited.',
  },
  copyTwoFactorAuthenticationIsNotConfigured: {
    id: 'fresco.actions.twoFactor.copyTwoFactorAuthenticationIsNotConfigured',
    defaultMessage: 'Two-factor authentication is not configured',
    description:
      'Error shown on the two-factor step of signing in when the account has no verified authenticator app set up for two-factor authentication.',
  },
  copyInvalidVerificationCode: {
    id: 'fresco.actions.twoFactor.copyInvalidVerificationCode',
    defaultMessage: 'Invalid verification code',
    description:
      'Error shown on the two-factor step of signing in when the 6-digit code from the authenticator app is wrong or expired.',
  },
  copyInvalidRecoveryCode: {
    id: 'fresco.actions.twoFactor.copyInvalidRecoveryCode',
    defaultMessage: 'Invalid recovery code',
    description:
      'Error shown on the two-factor step of signing in when the recovery code entered is wrong or has already been used.',
  },
  copyInvalidCodeFormat: {
    id: 'fresco.actions.twoFactor.copyInvalidCodeFormat',
    defaultMessage: 'Invalid code format',
    description:
      'Error shown on the two-factor step of signing in when the text entered is neither a 6-digit authenticator code nor a 20-character recovery code.',
  },
});

const TOTP_CODE_PATTERN = /^\d{6}$/;
const RECOVERY_CODE_PATTERN = /^[0-9a-f]{20}$/;

export async function verifyTwoFactor(
  data: unknown,
): Promise<FormSubmissionResult> {
  const { verifyTwoFactorSchema } = createTotpSchemas(createMessageError);

  const parsed = verifyTwoFactorSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      formErrors: [createMessageError(messages.copyInvalidSubmission)],
    };
  }

  const { twoFactorToken, code } = parsed.data;

  const installationId = await getInstallationId();
  if (!installationId) {
    return {
      success: false,
      formErrors: [
        createMessageError(
          messages.copyServerConfigurationErrorPleaseContactAnAdmin,
        ),
      ],
    };
  }
  const tokenResult = verifyTwoFactorToken(twoFactorToken, installationId);
  if (!tokenResult.valid) {
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyTwoFactorSessionExpiredPleaseSignIn),
      ],
    };
  }

  const { userId } = tokenResult;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  if (!user) {
    return {
      success: false,
      formErrors: [createMessageError(messages.copyUserNotFound)],
    };
  }

  const ipAddress = await getClientIp();
  const rateLimitResult = await checkRateLimit(user.username, ipAddress);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyTooManyAttemptsPleaseSignInAgain),
      ],
    };
  }

  const credential = await prisma.totpCredential.findFirst({
    where: { user_id: userId, verified: true },
  });

  if (!credential) {
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyTwoFactorAuthenticationIsNotConfigured),
      ],
    };
  }

  const isTotpCode = TOTP_CODE_PATTERN.test(code);
  const isRecoveryCode = RECOVERY_CODE_PATTERN.test(code);

  if (isTotpCode) {
    if (!verifyTotpCode(credential.secret, code)) {
      await recordLoginAttempt(user.username, ipAddress, false);
      return {
        success: false,
        formErrors: [createMessageError(messages.copyInvalidVerificationCode)],
      };
    }

    await createSessionCookie(userId);

    void addEvent('User Login', `User ${user.username} logged in`, {
      kind: 'userLogin',
      values: { username: user.username },
    });
    safeUpdateTag('activityFeed');

    return { success: true };
  }

  if (isRecoveryCode) {
    const codeHash = hashRecoveryCode(code);

    const { count } = await prisma.recoveryCode.updateMany({
      where: {
        user_id: userId,
        codeHash,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    if (count === 0) {
      await recordLoginAttempt(user.username, ipAddress, false);
      return {
        success: false,
        formErrors: [createMessageError(messages.copyInvalidRecoveryCode)],
      };
    }

    await createSessionCookie(userId);

    void addEvent(
      'Recovery Code Used',
      `User ${user.username} logged in with a recovery code`,
      { kind: 'recoveryLogin', values: { username: user.username } },
    );
    safeUpdateTag('activityFeed');

    return { success: true };
  }

  void recordLoginAttempt(user.username, ipAddress, false);
  return {
    success: false,
    formErrors: [createMessageError(messages.copyInvalidCodeFormat)],
  };
}
