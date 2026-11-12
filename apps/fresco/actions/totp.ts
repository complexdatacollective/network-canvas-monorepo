'use server';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { getServerIntl } from '~/i18n/server';
import { addEvent } from '~/lib/activityFeed';
import { requireApiAuth } from '~/lib/auth/guards';
import {
  generateQrCodeDataUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  generateTotpUri,
  hashRecoveryCode,
  verifyTotpCode,
} from '~/lib/auth/totp';
import {
  getTwoFactorStatus,
  isTwoFactorRequired,
} from '~/lib/auth/twoFactorPolicy';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { createTotpSchemas } from '~/schemas/totp';
import { getBaseUrl } from '~/utils/getBaseUrl';

const messages = defineMessages({
  copyFresco: {
    id: 'fresco.actions.totp.copyFresco',
    defaultMessage: 'Fresco ({value1})',
    description:
      "Issuer name shown in the authenticator app next to the researcher's account when they scan the two-factor QR code. value is the hostname of this installation. Keep Fresco as the product name.",
  },
  copyInvalidCode: {
    id: 'fresco.actions.totp.copyInvalidCode',
    defaultMessage: 'Invalid code',
    description:
      'Error returned when the two-factor code submitted while setting up, disabling or regenerating recovery codes is not in the expected form, such as not six digits.',
  },
  copyNoPendingTOTPSetupFound: {
    id: 'fresco.actions.totp.copyNoPendingTOTPSetupFound',
    defaultMessage: 'No pending TOTP setup found',
    description:
      'Error returned when the researcher confirms a code while setting up two-factor authentication but no setup is in progress for their account. TOTP means time-based codes from an authenticator app.',
  },
  copyInvalidVerificationCode: {
    id: 'fresco.actions.totp.copyInvalidVerificationCode',
    defaultMessage: 'Invalid verification code',
    description:
      "Error returned when the six-digit code from the researcher's authenticator app is wrong, in the two-factor setup, disable, recovery-code or re-verification forms.",
  },
  copyTwoFactorAuthenticationIsNotEnabled: {
    id: 'fresco.actions.totp.copyTwoFactorAuthenticationIsNotEnabled',
    defaultMessage: 'Two-factor authentication is not enabled',
    description:
      'Error returned when the researcher asks to verify, disable or regenerate recovery codes for two-factor authentication but their account has no two-factor authentication set up.',
  },
  copyInvalidRecoveryCode: {
    id: 'fresco.actions.totp.copyInvalidRecoveryCode',
    defaultMessage: 'Invalid recovery code',
    description:
      'Error returned when the two-factor recovery code (a single-use backup code) the researcher entered does not exist or was already used.',
  },
  copyInvalidCodeFormat: {
    id: 'fresco.actions.totp.copyInvalidCodeFormat',
    defaultMessage: 'Invalid code format',
    description:
      'Error returned when the code entered is neither a six-digit authenticator code nor a recovery code, so it cannot be checked.',
  },
  copyCannotResetYourOwnTwoFactorAuthentication: {
    id: 'fresco.actions.totp.copyCannotResetYourOwnTwoFactorAuthentication',
    defaultMessage: 'Cannot reset your own two-factor authentication',
    description:
      "Error returned when a researcher tries to reset two-factor authentication on their own account; resetting is only allowed for another researcher's account.",
  },
  twoFactorRequiredByInstallation: {
    id: 'fresco.actions.totp.twoFactorRequiredByInstallation',
    defaultMessage:
      'This installation of Fresco requires two-factor authentication for every account that signs in with a password, so it cannot be turned off.',
    description:
      'Error returned when a researcher tries to disable two-factor authentication while the REQUIRE_TWO_FACTOR environment variable is set.',
  },
});

export async function enableTotp() {
  try {
    // Setting up two-factor authentication is the one thing an account the
    // "Require Two-Factor Authentication" gate holds is allowed to do.
    const session = await requireApiAuth({ allowPendingTwoFactorSetup: true });

    const secret = generateTotpSecret();

    await prisma.totpCredential.upsert({
      where: { user_id: session.user.userId },
      update: {
        secret,
        verified: false,
        createdAt: new Date(),
      },
      create: {
        user_id: session.user.userId,
        secret,
        verified: false,
      },
    });

    const hostname = new URL(getBaseUrl()).hostname;
    const intl = await getServerIntl();
    const issuer = intl.formatMessage(messages.copyFresco, {
      value1: hostname,
    });
    const qrCodeDataUrl = await generateQrCodeDataUrl(
      generateTotpUri(secret, session.user.username, issuer),
    );

    return { error: null, data: { secret, qrCodeDataUrl } };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[enableTotp] FATAL ERROR:', err);
    throw err;
  }
}

export async function verifyTotpSetup(data: unknown) {
  const { verifyTotpSetupSchema } = createTotpSchemas(createMessageError);

  const session = await requireApiAuth({ allowPendingTwoFactorSetup: true });

  const parsed = verifyTotpSetupSchema.safeParse(data);
  if (!parsed.success) {
    return { error: createMessageError(messages.copyInvalidCode), data: null };
  }

  const { code } = parsed.data;

  const credential = await prisma.totpCredential.findUnique({
    where: { user_id: session.user.userId },
  });

  if (!credential || credential.verified) {
    return {
      error: createMessageError(messages.copyNoPendingTOTPSetupFound),
      data: null,
    };
  }

  if (!verifyTotpCode(credential.secret, code)) {
    return {
      error: createMessageError(messages.copyInvalidVerificationCode),
      data: null,
    };
  }

  const recoveryCodes = generateRecoveryCodes();

  await prisma.$transaction([
    prisma.totpCredential.update({
      where: { user_id: session.user.userId },
      data: { verified: true },
    }),
    prisma.recoveryCode.createMany({
      data: recoveryCodes.map((rc) => ({
        user_id: session.user.userId,
        codeHash: hashRecoveryCode(rc),
      })),
    }),
  ]);

  void addEvent(
    'Two-Factor Enabled',
    `User ${session.user.username} enabled two-factor authentication`,
    { kind: 'twoFactorEnabled', values: { username: session.user.username } },
  );
  safeUpdateTag('activityFeed');
  safeUpdateTag('getUsers');

  return { error: null, data: { recoveryCodes } };
}

const TOTP_CODE_PATTERN = /^\d{6}$/;
const RECOVERY_CODE_PATTERN = /^[0-9a-f]{20}$/;

export async function verifyCurrentUserTotp(
  code: string,
): Promise<FormSubmissionResult> {
  const session = await requireApiAuth();

  const credential = await prisma.totpCredential.findUnique({
    where: { user_id: session.user.userId },
  });

  if (!credential?.verified) {
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyTwoFactorAuthenticationIsNotEnabled),
      ],
    };
  }

  if (TOTP_CODE_PATTERN.test(code)) {
    if (!verifyTotpCode(credential.secret, code)) {
      return {
        success: false,
        formErrors: [createMessageError(messages.copyInvalidVerificationCode)],
      };
    }
    return { success: true };
  }

  if (RECOVERY_CODE_PATTERN.test(code)) {
    const codeHash = hashRecoveryCode(code);
    const found = await prisma.recoveryCode.findFirst({
      where: {
        user_id: session.user.userId,
        codeHash,
        usedAt: null,
      },
      select: { id: true },
    });

    if (!found) {
      return {
        success: false,
        formErrors: [createMessageError(messages.copyInvalidRecoveryCode)],
      };
    }
    return { success: true };
  }

  return {
    success: false,
    formErrors: [createMessageError(messages.copyInvalidCodeFormat)],
  };
}

export async function disableTotp(data: unknown) {
  const { disableTotpSchema } = createTotpSchemas(createMessageError);

  const session = await requireApiAuth();

  const parsed = disableTotpSchema.safeParse(data);
  if (!parsed.success) {
    return { error: createMessageError(messages.copyInvalidCode), data: null };
  }

  const { code } = parsed.data;

  const credential = await prisma.totpCredential.findUnique({
    where: { user_id: session.user.userId },
  });

  if (!credential?.verified) {
    return {
      error: createMessageError(
        messages.copyTwoFactorAuthenticationIsNotEnabled,
      ),
      data: null,
    };
  }

  // Refused before the code is checked, so a recovery code is not consumed by
  // an attempt that could never succeed.
  if (
    isTwoFactorRequired() &&
    (await getTwoFactorStatus(session.user.userId)).passwordMode
  ) {
    return {
      error: createMessageError(messages.twoFactorRequiredByInstallation),
      data: null,
    };
  }

  if (TOTP_CODE_PATTERN.test(code)) {
    if (!verifyTotpCode(credential.secret, code)) {
      return {
        error: createMessageError(messages.copyInvalidVerificationCode),
        data: null,
      };
    }
  } else if (RECOVERY_CODE_PATTERN.test(code)) {
    const codeHash = hashRecoveryCode(code);
    const { count } = await prisma.recoveryCode.updateMany({
      where: {
        user_id: session.user.userId,
        codeHash,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    if (count === 0) {
      return {
        error: createMessageError(messages.copyInvalidRecoveryCode),
        data: null,
      };
    }
  } else {
    return {
      error: createMessageError(messages.copyInvalidCodeFormat),
      data: null,
    };
  }

  await prisma.$transaction([
    prisma.totpCredential.delete({
      where: { user_id: session.user.userId },
    }),
    prisma.recoveryCode.deleteMany({
      where: { user_id: session.user.userId },
    }),
  ]);

  void addEvent(
    'Two-Factor Disabled',
    `User ${session.user.username} disabled two-factor authentication`,
    { kind: 'twoFactorDisabled', values: { username: session.user.username } },
  );
  safeUpdateTag('activityFeed');
  safeUpdateTag('getUsers');

  return { error: null, data: null };
}

export async function regenerateRecoveryCodes(data: unknown) {
  const { verifyTotpSetupSchema } = createTotpSchemas(createMessageError);

  const session = await requireApiAuth();

  const parsed = verifyTotpSetupSchema.safeParse(data);
  if (!parsed.success) {
    return { error: createMessageError(messages.copyInvalidCode), data: null };
  }

  const credential = await prisma.totpCredential.findUnique({
    where: { user_id: session.user.userId },
  });

  if (!credential?.verified) {
    return {
      error: createMessageError(
        messages.copyTwoFactorAuthenticationIsNotEnabled,
      ),
      data: null,
    };
  }

  if (!verifyTotpCode(credential.secret, parsed.data.code)) {
    return {
      error: createMessageError(messages.copyInvalidVerificationCode),
      data: null,
    };
  }

  const recoveryCodes = generateRecoveryCodes();

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({
      where: { user_id: session.user.userId },
    }),
    prisma.recoveryCode.createMany({
      data: recoveryCodes.map((rc) => ({
        user_id: session.user.userId,
        codeHash: hashRecoveryCode(rc),
      })),
    }),
  ]);

  void addEvent(
    'Recovery Codes Regenerated',
    `User ${session.user.username} regenerated recovery codes`,
    {
      kind: 'recoveryCodesRegenerated',
      values: { username: session.user.username },
    },
  );
  safeUpdateTag('activityFeed');

  return { error: null, data: { recoveryCodes } };
}

export async function resetTotpForUser(userId: string) {
  const session = await requireApiAuth();

  if (session.user.userId === userId) {
    return {
      error: createMessageError(
        messages.copyCannotResetYourOwnTwoFactorAuthentication,
      ),
      data: null,
    };
  }

  await prisma.$transaction([
    prisma.totpCredential.deleteMany({
      where: { user_id: userId },
    }),
    prisma.recoveryCode.deleteMany({
      where: { user_id: userId },
    }),
  ]);

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  void addEvent(
    'Two-Factor Reset',
    `User ${session.user.username} reset two-factor authentication for ${targetUser?.username ?? userId}`,
    {
      kind: 'twoFactorReset',
      values: {
        username: session.user.username,
        target: targetUser?.username ?? userId,
      },
    },
  );
  safeUpdateTag('activityFeed');
  safeUpdateTag('getUsers');

  return { error: null, data: null };
}
