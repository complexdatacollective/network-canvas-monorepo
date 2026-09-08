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
  isTotpEncryptionConfigured,
  openTotpSecret,
  sealTotpSecret,
  verifyTotpCode,
} from '~/lib/auth/totp';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { createTotpSchemas } from '~/schemas/totp';
import { getBaseUrl } from '~/utils/getBaseUrl';

const messages = defineMessages({
  copyFresco: {
    id: 'fresco.actions.totp.copyFresco',
    defaultMessage: 'Fresco ({value1})',
    description: 'Researcher-facing actions / totp: Fresco (value)',
  },
  copyInvalidCode: {
    id: 'fresco.actions.totp.copyInvalidCode',
    defaultMessage: 'Invalid code',
    description: 'Researcher-facing actions / totp: Invalid code',
  },
  copyNoPendingTOTPSetupFound: {
    id: 'fresco.actions.totp.copyNoPendingTOTPSetupFound',
    defaultMessage: 'No pending TOTP setup found',
    description:
      'Researcher-facing actions / totp: No pending TOTP setup found',
  },
  copyInvalidVerificationCode: {
    id: 'fresco.actions.totp.copyInvalidVerificationCode',
    defaultMessage: 'Invalid verification code',
    description: 'Researcher-facing actions / totp: Invalid verification code',
  },
  copyTwoFactorAuthenticationIsNotEnabled: {
    id: 'fresco.actions.totp.copyTwoFactorAuthenticationIsNotEnabled',
    defaultMessage: 'Two-factor authentication is not enabled',
    description:
      'Researcher-facing actions / totp: Two-factor authentication is not enabled',
  },
  copyInvalidRecoveryCode: {
    id: 'fresco.actions.totp.copyInvalidRecoveryCode',
    defaultMessage: 'Invalid recovery code',
    description: 'Researcher-facing actions / totp: Invalid recovery code',
  },
  copyInvalidCodeFormat: {
    id: 'fresco.actions.totp.copyInvalidCodeFormat',
    defaultMessage: 'Invalid code format',
    description: 'Researcher-facing actions / totp: Invalid code format',
  },
  copyCannotResetYourOwnTwoFactorAuthentication: {
    id: 'fresco.actions.totp.copyCannotResetYourOwnTwoFactorAuthentication',
    defaultMessage: 'Cannot reset your own two-factor authentication',
    description:
      'Researcher-facing actions / totp: Cannot reset your own two-factor authentication',
  },
  copyTwoFactorAuthenticationUnavailable: {
    id: 'fresco.actions.totp.copyTwoFactorAuthenticationUnavailable',
    defaultMessage:
      'Two-factor authentication cannot be enabled on this server because it has no TOTP_ENCRYPTION_KEY configured. Ask whoever deploys Fresco to set one, then try again.',
    description:
      'Researcher-facing actions / totp: shown when enabling two-factor authentication is refused because the server has no TOTP_ENCRYPTION_KEY environment variable to encrypt the secret with',
  },
});

export async function enableTotp() {
  try {
    const session = await requireApiAuth();

    if (!isTotpEncryptionConfigured()) {
      return {
        error: createMessageError(
          messages.copyTwoFactorAuthenticationUnavailable,
        ),
        data: null,
      };
    }

    const secret = generateTotpSecret();
    // Only the sealed envelope reaches the database; the plaintext goes to the
    // user once, in the QR code and the manual-entry secret below.
    const storedSecret = sealTotpSecret(secret);

    await prisma.totpCredential.upsert({
      where: { user_id: session.user.userId },
      update: {
        secret: storedSecret,
        verified: false,
        createdAt: new Date(),
      },
      create: {
        user_id: session.user.userId,
        secret: storedSecret,
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

  const session = await requireApiAuth();

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

  if (!verifyTotpCode(openTotpSecret(credential.secret), code)) {
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
    if (!verifyTotpCode(openTotpSecret(credential.secret), code)) {
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

  if (TOTP_CODE_PATTERN.test(code)) {
    if (!verifyTotpCode(openTotpSecret(credential.secret), code)) {
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

  if (!verifyTotpCode(openTotpSecret(credential.secret), parsed.data.code)) {
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
