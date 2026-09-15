import type pg from 'pg';

import type { StudioEnv } from '../env.ts';
import type { JobClient } from '../jobs/client.ts';
import { createSignInEmailSender } from '../jobs/sign-in-email.ts';
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
): AuthService {
  if (!env.db || !env.auth || !pool) return createDisabledAuthService();
  return createBetterAuthService(
    env.auth,
    pool,
    createSignInEmailSender(jobs, pool),
  );
}
