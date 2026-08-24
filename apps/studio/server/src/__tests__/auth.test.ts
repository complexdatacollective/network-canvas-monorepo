import { safe } from '@orpc/client';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import { createBetterAuthService } from '../auth/better-auth.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv, type StudioEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'user-1',
  email: 'researcher@example.com',
  emailVerified: true,
  name: 'Researcher',
  sessionId: 'session-1',
};

describe('principal resolution', () => {
  it('resolves the cookie session into the RPC context', async () => {
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
    });
    const client = createRpcClient(createApp(readEnv(), { auth }));
    const me = await client.me();
    expect(me).toEqual({
      userId: 'user-1',
      email: 'researcher@example.com',
      emailVerified: true,
      name: 'Researcher',
    });
  });

  it('refuses protected procedures without a session', async () => {
    const auth = stubAuthService();
    const client = createRpcClient(createApp(readEnv(), { auth }));
    const { error } = await safe(client.me());
    expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('never falls back to the cookie when an Authorization header is present', async () => {
    let getSessionCalls = 0;
    const auth = stubAuthService({
      getSession: () => {
        getSessionCalls += 1;
        return Promise.resolve(PRINCIPAL);
      },
    });
    const app = createApp(readEnv(), { auth });

    const me = await createRpcClient(app).me();
    expect(me.userId).toBe('user-1');

    // With the header, the request is on the token plane (#1248): the cookie
    // session must not even be consulted.
    const { error } = await safe(
      createRpcClient(app, { authorization: 'Bearer some-token' }).me(),
    );
    expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getSessionCalls).toBe(1);
  });

  it('reports auth capabilities in the RPC status', async () => {
    const client = createRpcClient(createApp());
    const status = await client.status();
    expect(status.auth).toEqual({
      enabled: true,
      magicLink: true,
      socialProviders: [],
    });
  });

  it('lists configured OAuth providers in the RPC status', async () => {
    const base = readEnv();
    if (!base.auth) throw new Error('dev env must configure auth');
    const withProviders: StudioEnv = {
      ...base,
      auth: {
        ...base.auth,
        socialProviders: {
          google: { clientId: 'google-id', clientSecret: 'google-secret' },
          microsoft: { clientId: 'ms-id', clientSecret: 'ms-secret' },
        },
      },
    };
    const client = createRpcClient(createApp(withProviders));
    const status = await client.status();
    expect(status.auth.socialProviders).toEqual(['google', 'microsoft']);
  });
});

describe('unconfigured auth', () => {
  const env: StudioEnv = {
    port: 3000,
    host: '0.0.0.0',
    clientDist: undefined,
    s3: undefined,
    db: undefined,
    auth: undefined,
    devDefaults: false,
  };

  it('refuses /api/auth with 503 problem JSON', async () => {
    const app = createApp(env);
    const res = await app.request('/api/auth/session', {
      method: 'GET',
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('reports auth as disabled in status', async () => {
    const client = createRpcClient(createApp(env));
    const status = await client.status();
    expect(status.auth).toEqual({
      enabled: false,
      magicLink: false,
      socialProviders: [],
    });
  });

  it('refuses protected procedures', async () => {
    const client = createRpcClient(createApp(env));
    const { error } = await safe(client.me());
    expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// Runs in its own Postgres schema, like the fingerprint suite: this test
// needs an empty rate-limit table to start from, and clearing that in the
// shared database would delete durable security counters from whatever
// DATABASE_URL happens to point at.

const env = readEnv();

const db = await reachableDb();

/**
 * Signs a fresh user in end to end against a provisioned scratch schema,
 * asserting each step of the flow. The schema must be freshly provisioned:
 * the magic-link limit (5/60s per IP) is durable in Postgres and vitest
 * always resolves to the same localhost key, so counters left by an earlier
 * run in a shared table would 429 the send.
 */
async function signInWithMagicLink(pool: pg.Pool, prefix: string) {
  if (!env.auth) throw new Error('dev env must configure auth');
  const sent: { email: string; url: string }[] = [];
  const auth = createBetterAuthService(env.auth, pool, {
    sendMagicLink: (input) => {
      sent.push(input);
      return Promise.resolve();
    },
  });
  const app = createApp(env, { auth });
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

describe.skipIf(!db)('magic-link sign-in', () => {
  it('signs in end to end: send, verify, session, me', async () => {
    if (!db) throw new Error('unreachable');
    const scratch = await createScratchSchema(db);
    try {
      await provisionScratchSchema(scratch.pool);
      const { app, email, cookie } = await signInWithMagicLink(
        scratch.pool,
        'researcher',
      );

      const me = await createRpcClient(app, { cookie }).me();
      expect(me.email).toBe(email);
      expect(me.emailVerified).toBe(true);

      const { error } = await safe(createRpcClient(app).me());
      expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
    } finally {
      await scratch.dispose();
    }
  });
});

describe.skipIf(!db)('teams (organization plugin)', () => {
  it('creates a team and resolves the creator membership', async () => {
    if (!db) throw new Error('unreachable');
    const scratch = await createScratchSchema(db);
    try {
      await provisionScratchSchema(scratch.pool);
      const { app, auth, cookie } = await signInWithMagicLink(
        scratch.pool,
        'owner',
      );
      const me = await createRpcClient(app, { cookie }).me();

      // Through the plugin's own endpoint: exercises the drizzle adapter
      // against the folded team tables end to end.
      const create = await app.request('/api/auth/organization/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:5173',
          cookie,
        },
        body: JSON.stringify({ name: 'My Study Group', slug: 'my-studies' }),
      });
      expect(create.status).toBe(200);
      const team = (await create.json()) as { id: string; slug: string };
      expect(team.slug).toBe('my-studies');

      expect(await auth.getMembership(me.userId, team.id)).toEqual({
        role: 'owner',
      });
      expect(await auth.getMembership(me.userId, 'not-a-team')).toBeNull();
      expect(await auth.getMembership('someone-else', team.id)).toBeNull();

      // The plugin only check-then-inserts memberships, so the composite
      // unique index is what keeps that single-row read unambiguous. Omitting
      // created_at also exercises its default.
      await expect(
        scratch.pool.query(
          `insert into team_members (id, team_id, user_id, role)
           values ($1, $2, $3, 'member')`,
          ['second-membership', team.id, me.userId],
        ),
      ).rejects.toThrow(/duplicate key/);
    } finally {
      await scratch.dispose();
    }
  });
});
