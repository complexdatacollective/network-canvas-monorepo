import type pg from 'pg';
import { expect } from 'vitest';

import { createApp } from '../../app.ts';
import { createBetterAuthService } from '../../auth/better-auth.ts';
import type { AuthService } from '../../auth/service.ts';
import type { StudioEnv } from '../../env.ts';

/**
 * An AuthService double that answers every method with its null case; tests
 * state only what they override. Growing the AuthService interface then
 * touches this file, not every test that stubs it.
 */
export function stubAuthService(overrides?: Partial<AuthService>): AuthService {
  return {
    handler: () => Promise.resolve(Response.json({})),
    getSession: () => Promise.resolve(null),
    getMembership: () => Promise.resolve(null),
    listMemberships: () => Promise.resolve([]),
    ...overrides,
  };
}

/**
 * Signs a fresh user in end to end against a provisioned scratch schema,
 * asserting each step of the flow. The schema must be freshly provisioned:
 * the magic-link limit (5/60s per IP) is durable in Postgres and vitest
 * always resolves to the same localhost key, so counters left by an earlier
 * run in a shared table would 429 the send.
 */
export async function signInWithMagicLink(
  env: StudioEnv,
  pool: pg.Pool,
  prefix: string,
) {
  if (!env.auth) throw new Error('dev env must configure auth');
  const sent: { email: string; url: string }[] = [];
  const auth = createBetterAuthService(env.auth, pool, {
    sendMagicLink: (input) => {
      sent.push(input);
      return Promise.resolve();
    },
  });
  // The same pool better-auth writes through, so RPC procedures address the
  // scratch schema too rather than whatever DATABASE_URL points at.
  const app = createApp(env, { auth, pool });
  const email = `${prefix}-${Date.now()}@example.com`;

  const send = await app.request('/api/auth/sign-in/magic-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'origin': 'http://localhost:5173',
    },
    body: JSON.stringify({ email, callbackURL: '/' }),
  });
  expect(send.status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.email).toBe(email);

  const verify = await app.request(sent[0]!.url);
  expect([302, 200]).toContain(verify.status);
  const setCookie = verify.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  const cookie = (setCookie ?? '').split(';')[0]!;

  return { app, auth, email, cookie };
}
