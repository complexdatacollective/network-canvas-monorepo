import type pg from 'pg';

import type { StudioEnv } from '../env.ts';
import type { JobClient } from '../jobs/client.ts';
import { createSignInEmailSender } from '../jobs/sign-in-email.ts';
import { createSecretsCipher } from '../secrets/cipher.ts';
import type { RateLimiter } from '../rate-limit.ts';
import { createBetterAuthService } from './better-auth.ts';
import { type AuthService, createDisabledAuthService } from './service.ts';

// createApp is the single pool constructor; without one there is no database
// and auth is disabled.
//
// No mailer is constructed here, and none can be: sign-in mail is a job the
// worker sends (#1895), so this process only ever creates one.
export function createAuthService(
  env: StudioEnv,
  pool?: pg.Pool,
  jobs?: JobClient,
  /** Where sign-in attempts are counted (#1909); `createApp` builds it. */
  limiter?: RateLimiter,
): AuthService {
  if (!env.db || !env.auth || !pool) return createDisabledAuthService();
  // `resolve` refuses a configured database without a keyring, so reaching
  // here without one is impossible; narrowed rather than asserted so the
  // failure names the cause instead of surfacing as a missing-method error
  // from inside better-auth's first account write.
  if (!env.secrets) {
    throw new Error(
      'A secrets keyring is required to serve authentication: STUDIO_SECRETS_KEY (or STUDIO_SECRETS_KEY_FILE) is unset while a database is configured.',
    );
  }
  return createBetterAuthService(
    env.auth,
    pool,
    createSignInEmailSender(jobs, pool),
    createSecretsCipher(env.secrets),
    limiter,
  );
}
