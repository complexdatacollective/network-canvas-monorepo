import type pg from 'pg';
import { expect } from 'vitest';

import { createApp } from '../../app.ts';
import { createBetterAuthService } from '../../auth/better-auth.ts';
import type { AuthService } from '../../auth/service.ts';
import type { StudioEnv } from '../../env.ts';
import { testCipher } from './secrets.ts';

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
    signUpEmail: () => Promise.resolve({ kind: 'unavailable' }),
    signInEmail: () => Promise.resolve({ kind: 'refused' }),
    ...overrides,
  };
}

/**
 * Signs a fresh user in end to end against a provisioned scratch schema,
 * asserting each step of the flow. The better-auth instance it builds is given
 * no limiter, so it enforces no sign-in limit of its own (#1909) — every
 * vitest process resolves to the same localhost address, and a shared per-
 * address bucket would 429 one file's sign-in because another file signed in.
 * The app's per-email limit still applies, and the address below is fresh.
 */
export async function signInWithMagicLink(
  env: StudioEnv,
  pool: pg.Pool,
  prefix: string,
) {
  if (!env.auth) throw new Error('dev env must configure auth');
  const sent: { email: string; url: string }[] = [];
  const auth = createBetterAuthService(
    env.auth,
    pool,
    (input) => {
      sent.push(input);
      return Promise.resolve();
    },
    testCipher(),
  );
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
