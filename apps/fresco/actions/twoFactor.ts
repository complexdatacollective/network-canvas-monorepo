'use server';

import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { createSessionCookie } from '~/lib/auth/session';
import { verifyTwoFactorCore } from '~/lib/auth/twoFactorCore';
import { safeUpdateTag } from '~/lib/cache';
import { getClientIp } from '~/utils/getClientIp';

import { addEvent } from './activityFeed';

export async function verifyTwoFactor(
  data: unknown,
): Promise<FormSubmissionResult> {
  const outcome = await verifyTwoFactorCore(data, await getClientIp());

  if (!outcome.authenticated) return outcome.result;

  await createSessionCookie(outcome.userId);

  void addEvent(
    outcome.usedRecoveryCode ? 'Recovery Code Used' : 'User Login',
    outcome.usedRecoveryCode
      ? `User ${outcome.username} logged in with a recovery code`
      : `User ${outcome.username} logged in`,
  );
  safeUpdateTag('activityFeed');

  return { success: true };
}
