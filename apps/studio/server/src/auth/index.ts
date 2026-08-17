import type pg from 'pg';

import { createPool } from '../db/pool.ts';
import type { StudioEnv } from '../env.ts';
import { createBetterAuthService } from './better-auth.ts';
import { createMailer } from './email.ts';
import { type AuthService, createDisabledAuthService } from './service.ts';

export type { AuthService, Principal, SessionPrincipal } from './service.ts';

export function createAuthService(env: StudioEnv, pool?: pg.Pool): AuthService {
  if (!env.db || !env.auth) return createDisabledAuthService();
  return createBetterAuthService(
    env.auth,
    pool ?? createPool(env.db),
    createMailer(env.auth.mailer),
  );
}
