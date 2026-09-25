import type { Context } from 'effect';
import type pg from 'pg';

import type { StudioEnv } from '../env.ts';
import { createSignInEmailSender } from '../jobs/sign-in-email.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import type { StudioServices } from '../rpc/deps.ts';
import { createSecretsCipher } from '../secrets/cipher.ts';
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
  /**
   * What sign-in mail is queued on (#1895). Absent only where there is no
   * database, which is also where auth is disabled outright — so reaching the
   * sender with none is unrepresentable rather than refused at send time, and
   * the "no job client is configured" rejection this replaced is gone.
   */
  services?: Context.Context<StudioServices>,
  /** Where sign-in attempts are counted (#1909); `createApp` builds it. */
  limiter?: RateLimiter['Service'],
): AuthService {
  if (!env.db || !env.auth || !pool || !services) {
    return createDisabledAuthService();
  }
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
    createSignInEmailSender(services),
    createSecretsCipher(env.secrets),
    limiter,
  );
}
