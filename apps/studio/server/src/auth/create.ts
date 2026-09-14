import type pg from 'pg';

import type { StudioEnv } from '../env.ts';
import { createBetterAuthService } from './better-auth.ts';
import { createMailer, type StudioMailer } from './email.ts';
import { type AuthService, createDisabledAuthService } from './service.ts';

// createApp is the single pool constructor; without one there is no database
// and auth is disabled.
export function createAuthService(
  env: StudioEnv,
  pool?: pg.Pool,
  mailer?: StudioMailer,
): AuthService {
  if (!env.db || !env.auth || !pool) return createDisabledAuthService();
  return createBetterAuthService(
    env.auth,
    pool,
    mailer ?? createMailer(env.auth.mailer),
  );
}
