import { createServerFn } from '@tanstack/react-start';

import { type FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import {
  loginCore,
  recoveryCodeLoginCore,
  type LoginResult,
} from '~/lib/auth/loginCore';
import { verifyTwoFactorCore } from '~/lib/auth/twoFactorCore';
import { addEvent } from '~/src/server/activityFeed';
import { getClientIp } from '~/src/server/clientIp';
import { authed } from '~/src/server/middleware';
import { clearSessionCookie, createSessionCookie } from '~/src/server/session';

/**
 * `actions/auth.ts` as TanStack Start server functions. The bodies are almost
 * empty: everything that matters moved to `lib/auth/loginCore.ts` and is shared
 * verbatim with the Next.js Server Actions.
 *
 * There is no `safeUpdateTag('activityFeed')` call here. Under the chosen
 * cache replacement — option (i), no server cache — there is no stale entry to
 * invalidate; the next read queries Postgres.
 */

export const login = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<LoginResult> => {
    const outcome = await loginCore(data, getClientIp());

    if (!outcome.authenticated) return outcome.result;

    await createSessionCookie(outcome.userId);
    void addEvent('User Login', `User ${outcome.username} logged in`);

    return { success: true };
  });

export const recoveryCodeLogin = createServerFn({ method: 'POST' })
  .validator((data: { username: string; recoveryCode: string }) => data)
  .handler(async ({ data }): Promise<FormSubmissionResult> => {
    const outcome = await recoveryCodeLoginCore(data, getClientIp());

    if (!outcome.authenticated) return outcome.result;

    await createSessionCookie(outcome.userId);
    void addEvent(
      'Recovery Code Used',
      `User ${outcome.username} logged in with a recovery code`,
    );

    return { success: true };
  });

export const verifyTwoFactor = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<FormSubmissionResult> => {
    const outcome = await verifyTwoFactorCore(data, getClientIp());

    if (!outcome.authenticated) return outcome.result;

    await createSessionCookie(outcome.userId);

    void addEvent(
      outcome.usedRecoveryCode ? 'Recovery Code Used' : 'User Login',
      outcome.usedRecoveryCode
        ? `User ${outcome.username} logged in with a recovery code`
        : `User ${outcome.username} logged in`,
    );

    return { success: true };
  });

export const logout = createServerFn({ method: 'POST' })
  .middleware([authed])
  .handler(async ({ context }) => {
    await clearSessionCookie(context.session.sessionId);
    return { error: null, data: { success: true } };
  });
