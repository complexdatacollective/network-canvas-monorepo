import type pg from 'pg';

import type { StudioEnv } from '../env.ts';
import { createBetterAuthService } from './better-auth.ts';
import { createMailer } from './email.ts';
import { type AuthService, createDisabledAuthService } from './service.ts';

// createApp is the single pool constructor; without one there is no database
// and auth is disabled.
export function createAuthService(env: StudioEnv, pool?: pg.Pool): AuthService {
  if (!env.db || !env.auth || !pool) return createDisabledAuthService();
  return createBetterAuthService(env.auth, pool, createMailer(env.auth.mailer));
}
