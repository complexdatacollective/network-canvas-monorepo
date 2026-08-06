'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { getServerSession } from '~/lib/auth/guards';
import {
  loginCore,
  recoveryCodeLoginCore,
  type LoginResult,
} from '~/lib/auth/loginCore';
import { createSessionCookie, SESSION_COOKIE_NAME } from '~/lib/auth/session';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { isAppConfigured } from '~/queries/appSettings';
import { createUserSchema } from '~/schemas/auth';
import { getClientIp } from '~/utils/getClientIp';
import { hashPassword } from '~/utils/password';

import { addEvent } from './activityFeed';

export type { LoginResult };

export async function signup(formData: unknown) {
  // Account creation must be impossible once the app is configured. This is
  // enforced here (not only in the setup page) because Server Actions are
  // directly-invokable endpoints reachable regardless of which page rendered.
  if (await isAppConfigured()) {
    return { success: false, error: 'Setup is already complete.' };
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
      error: 'Invalid form submission',
    };
  }

  const { username, password: validPassword } = parsedFormData.data;
  const hashedPassword = await hashPassword(validPassword);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        username,
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
      error: 'Username already taken',
    };
  }

  await createSessionCookie(user.id);

  redirect('/setup?step=2');
}

export const login = async (data: unknown): Promise<LoginResult> => {
  const outcome = await loginCore(data, await getClientIp());

  if (!outcome.authenticated) return outcome.result;

  await createSessionCookie(outcome.userId);

  void addEvent('User Login', `User ${outcome.username} logged in`);
  safeUpdateTag('activityFeed');

  return {
    success: true,
  };
};

export async function recoveryCodeLogin(data: {
  username: string;
  recoveryCode: string;
}): Promise<FormSubmissionResult> {
  const outcome = await recoveryCodeLoginCore(data, await getClientIp());

  if (!outcome.authenticated) return outcome.result;

  await createSessionCookie(outcome.userId);

  void addEvent(
    'Recovery Code Used',
    `User ${outcome.username} logged in with a recovery code`,
  );

  return { success: true };
}

export async function logout() {
  const session = await getServerSession();
  if (!session) {
    return {
      error: 'Unauthorized',
    };
  }

  await prisma.session
    .delete({ where: { id: session.sessionId } })
    .catch((_error: unknown) => undefined);

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  revalidatePath('/');
}
