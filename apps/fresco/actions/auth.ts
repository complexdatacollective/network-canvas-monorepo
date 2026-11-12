'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { isFrescoLocale } from '~/i18n/locales';
import { addEvent } from '~/lib/activityFeed';
import { getServerSession } from '~/lib/auth/guards';
import { createSessionCookie, SESSION_COOKIE_NAME } from '~/lib/auth/session';
import { createTwoFactorToken, hashRecoveryCode } from '~/lib/auth/totp';
import { requiresTwoFactorSetup } from '~/lib/auth/twoFactorPolicy';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { checkRateLimit, recordLoginAttempt } from '~/lib/rateLimit';
import { getInstallationId, isAppConfigured } from '~/queries/appSettings';
import { createAuthSchemas } from '~/schemas/auth';
import { getClientIp } from '~/utils/getClientIp';
import { hashPassword, verifyPassword } from '~/utils/password';

const messages = defineMessages({
  copySetupIsAlreadyComplete: {
    id: 'fresco.actions.auth.copySetupIsAlreadyComplete',
    defaultMessage: 'Setup is already complete.',
    description:
      'Error shown in the first-account form of the setup wizard when someone submits it after the installation has already been set up.',
  },
  copyInvalidFormSubmission: {
    id: 'fresco.actions.auth.copyInvalidFormSubmission',
    defaultMessage: 'Invalid form submission',
    description:
      'Error shown in the first-account form of the setup wizard when the server rejects the submitted username or password as invalid.',
  },
  copyUsernameAlreadyTaken: {
    id: 'fresco.actions.auth.copyUsernameAlreadyTaken',
    defaultMessage: 'Username already taken',
    description:
      'Error shown in the first-account form of the setup wizard when the chosen username could not be saved, because it is already used.',
  },
  copyIncorrectUsernameOrPassword: {
    id: 'fresco.actions.auth.copyIncorrectUsernameOrPassword',
    defaultMessage: 'Incorrect username or password',
    description:
      'Error shown above the sign-in form when the username does not exist or the password is wrong. Deliberately does not say which.',
  },
  copyServerConfigurationErrorPleaseContactAnAdmin: {
    id: 'fresco.actions.auth.copyServerConfigurationErrorPleaseContactAnAdmin',
    defaultMessage: 'Server configuration error. Please contact an admin.',
    description:
      'Error shown above the sign-in form when the password was right but two-factor sign-in cannot continue because the installation has no installation ID. The administrator must fix the server.',
  },
  copyTooManyAttemptsPleaseTryAgainLater: {
    id: 'fresco.actions.auth.copyTooManyAttemptsPleaseTryAgainLater',
    defaultMessage: 'Too many attempts. Please try again later.',
    description:
      'Error shown above the recovery-code sign-in form when too many sign-in attempts were made recently and the researcher is temporarily blocked.',
  },
  copyInvalidUsernameOrRecoveryCode: {
    id: 'fresco.actions.auth.copyInvalidUsernameOrRecoveryCode',
    defaultMessage: 'Invalid username or recovery code',
    description:
      'Error shown above the recovery-code sign-in form when the username does not exist or the two-factor recovery code is wrong or already used.',
  },
  copyUnauthorized: {
    id: 'fresco.actions.auth.copyUnauthorized',
    defaultMessage: 'Unauthorized',
    description:
      'Error returned when a researcher tries to sign out but there is no signed-in session, for example because it already expired.',
  },
});

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

/**
 * The password was right and a session exists, but the installation requires
 * two-factor authentication and this account has none yet. The session can
 * reach nothing but the setup flow until it does (see lib/auth/guards.ts), so
 * the sign-in form sends the researcher straight there.
 */
type TwoFactorSetupRequired = {
  success: true;
  requiresTwoFactorSetup: true;
};

export type LoginResult =
  | FormSubmissionResult
  | RateLimited
  | TwoFactorRequired
  | TwoFactorSetupRequired;

// Precomputed lazily once per server instance. Used to equalize login response
// time on the "no such user / passkey-only" path, preventing timing-based
// username enumeration.
let dummyPasswordHash: string | null = null;
async function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= await hashPassword('fresco-dummy-password-do-not-use');
  return dummyPasswordHash;
}

export async function signup(
  formData: unknown,
  localePreference: unknown = null,
) {
  const { createUserSchema } = createAuthSchemas(createMessageError);

  // Account creation must be impossible once the app is configured. This is
  // enforced here (not only in the setup page) because Server Actions are
  // directly-invokable endpoints reachable regardless of which page rendered.
  if (await isAppConfigured()) {
    return {
      success: false,
      error: createMessageError(messages.copySetupIsAlreadyComplete),
    };
  }

  // Password-based signup only. Passkey-only accounts must go through
  // `signupWithPasskey`, which creates the user and stores the credential in a
  // single step after registration has been verified — accepting a null
  // password here would let a direct Server Action call create a credential-less
  // account and claim the setup session.
  const parsedFormData = createUserSchema.safeParse(formData);

  if (!parsedFormData.success) {
    return {
      success: false,
      error: createMessageError(messages.copyInvalidFormSubmission),
    };
  }

  const { username, password: validPassword } = parsedFormData.data;
  const hashedPassword = await hashPassword(validPassword);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        username,
        locale: isFrescoLocale(localePreference) ? localePreference : null,
        key: {
          create: {
            id: `username:${username}`,
            hashed_password: hashedPassword,
          },
        },
      },
    });
  } catch {
    return {
      success: false,
      error: createMessageError(messages.copyUsernameAlreadyTaken),
    };
  }

  await createSessionCookie(user.id);

  return redirect('/setup?step=2');
}

export const login = async (data: unknown): Promise<LoginResult> => {
  const { loginSchema } = createAuthSchemas(createMessageError);

  const parsedFormData = loginSchema.safeParse(data);

  if (!parsedFormData.success) {
    return {
      success: false,
      ...z.flattenError(parsedFormData.error),
    };
  }

  const { username, password } = parsedFormData.data;
  const ipAddress = await getClientIp();

  const rateLimitResult = await checkRateLimit(username, ipAddress);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      rateLimited: true,
      retryAfter: rateLimitResult.retryAfter,
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
      success: false,
      formErrors: [
        createMessageError(messages.copyIncorrectUsernameOrPassword),
      ],
    };
  }

  const validPassword = await verifyPassword(password, key.hashed_password);

  if (!validPassword) {
    await recordLoginAttempt(username, ipAddress, false);
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyIncorrectUsernameOrPassword),
      ],
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
        success: false,
        formErrors: [
          createMessageError(
            messages.copyServerConfigurationErrorPleaseContactAnAdmin,
          ),
        ],
      };
    }
    const twoFactorToken = createTwoFactorToken(key.user_id, installationId);
    return {
      success: false,
      requiresTwoFactor: true,
      twoFactorToken,
    };
  }

  await createSessionCookie(key.user_id);

  void addEvent('User Login', `User ${username} logged in`, {
    kind: 'userLogin',
    values: { username },
  });
  safeUpdateTag('activityFeed');

  if (await requiresTwoFactorSetup(key.user_id)) {
    return { success: true, requiresTwoFactorSetup: true };
  }

  return {
    success: true,
  };
};

export async function recoveryCodeLogin(data: {
  username: string;
  recoveryCode: string;
}): Promise<FormSubmissionResult> {
  const ipAddress = await getClientIp();

  const rateLimitResult = await checkRateLimit(data.username, ipAddress);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyTooManyAttemptsPleaseTryAgainLater),
      ],
    };
  }

  const user = await prisma.user.findUnique({
    where: { username: data.username },
    select: { id: true, username: true },
  });

  if (!user) {
    await recordLoginAttempt(data.username, ipAddress, false);
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyInvalidUsernameOrRecoveryCode),
      ],
    };
  }

  const codeHash = hashRecoveryCode(data.recoveryCode);

  const { count } = await prisma.recoveryCode.updateMany({
    where: {
      user_id: user.id,
      codeHash,
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  if (count === 0) {
    await recordLoginAttempt(data.username, ipAddress, false);
    return {
      success: false,
      formErrors: [
        createMessageError(messages.copyInvalidUsernameOrRecoveryCode),
      ],
    };
  }

  await recordLoginAttempt(data.username, ipAddress, true);
  await createSessionCookie(user.id);

  void addEvent(
    'Recovery Code Used',
    `User ${user.username} logged in with a recovery code`,
    { kind: 'recoveryLogin', values: { username: user.username } },
  );

  return { success: true };
}

export async function logout() {
  const session = await getServerSession();
  if (!session) {
    return {
      error: createMessageError(messages.copyUnauthorized),
    };
  }

  await prisma.session
    .delete({ where: { id: session.sessionId } })
    .catch((_error: unknown) => undefined);

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  revalidatePath('/');
  return undefined;
}
