import { createORPCClient, safe } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { describe, expect, it } from 'vitest';

import type { contract } from '@codaco/studio-rpc';

import { createApp } from '../app.ts';
import { createBetterAuthService } from '../auth/better-auth.ts';
import type { AuthService, SessionPrincipal } from '../auth/index.ts';
import { createPool } from '../db/pool.ts';
import { ensureSchema, staleSchemaMessage } from '../db/schema.ts';
import { readEnv, type StudioEnv } from '../env.ts';
import { reachableDb } from './support/postgres.ts';

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'user-1',
  email: 'researcher@example.com',
  emailVerified: true,
  name: 'Researcher',
  sessionId: 'session-1',
};

function createRpcClient(
  app: ReturnType<typeof createApp>,
  headers: Record<string, string> = {},
) {
  const link = new RPCLink({
    origin: 'http://studio.test',
    url: '/rpc',
    headers: { 'sec-fetch-site': 'same-origin', ...headers },
    fetch: async (url, init) => app.request(url, init),
  });
  return createORPCClient(link) as RouterContractClient<typeof contract>;
}

describe('principal resolution', () => {
  it('resolves the cookie session into the RPC context', async () => {
    const auth: AuthService = {
      handler: () => Promise.resolve(Response.json({})),
      getSession: () => Promise.resolve(PRINCIPAL),
    };
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
    const auth: AuthService = {
      handler: () => Promise.resolve(Response.json({})),
      getSession: () => Promise.resolve(null),
    };
    const client = createRpcClient(createApp(readEnv(), { auth }));
    const { error } = await safe(client.me());
    expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('never falls back to the cookie when an Authorization header is present', async () => {
    let getSessionCalls = 0;
    const auth: AuthService = {
      handler: () => Promise.resolve(Response.json({})),
      getSession: () => {
        getSessionCalls += 1;
        return Promise.resolve(PRINCIPAL);
      },
    };
    const app = createApp(readEnv(), { auth });

    // The same request without the header authenticates...
    const me = await createRpcClient(app).me();
    expect(me.userId).toBe('user-1');

    // ...and with it, the request is on the token plane (#1248): the cookie
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
  // A production boot without DATABASE_URL: the server runs, auth refuses.
  const env: StudioEnv = {
    port: 3000,
    host: '0.0.0.0',
    clientDist: undefined,
    s3: undefined,
    db: undefined,
    auth: undefined,
    production: true,
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

// The full magic-link round trip against a real Postgres — the dev instance
// from scripts/dev-pg.ts. Skips when no database is reachable (same pattern
// as the asset and connectivity suites). The mailer interface is the test
// seam: a capturing implementation stands in for email delivery.

const env = readEnv();

const db = await reachableDb();

describe.skipIf(!db)('magic-link sign-in', () => {
  it('signs in end to end: send, verify, session, me', async () => {
    if (!db || !env.auth) throw new Error('dev env must configure auth');
    const pool = createPool(db);
    try {
      const state = await ensureSchema(pool);
      if (state.kind === 'stale') {
        throw new Error(staleSchemaMessage(state));
      }
      // The magic-link send limit (5/60s per IP) is durable in Postgres and
      // vitest always resolves to the same localhost key, so counters from
      // earlier runs would 429 this one. Start the window fresh.
      await pool.query('DELETE FROM "rateLimit"');

      const sent: { email: string; url: string }[] = [];
      const auth = createBetterAuthService(env.auth, pool, {
        sendMagicLink: (input) => {
          sent.push(input);
          return Promise.resolve();
        },
      });
      const app = createApp(env, { auth });
      const email = `researcher-${Date.now()}@example.com`;

      // Request a magic link the way the SPA does.
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

      // Follow the emailed link; the verify redirect carries the session
      // cookie.
      const verify = await app.request(sent[0]!.url);
      expect([302, 200]).toContain(verify.status);
      const setCookie = verify.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      const cookie = (setCookie ?? '').split(';')[0]!;

      // The session authenticates the protected RPC surface.
      const me = await createRpcClient(app, { cookie }).me();
      expect(me.email).toBe(email);
      expect(me.emailVerified).toBe(true);

      // Without the cookie, the same procedure refuses.
      const { error } = await safe(createRpcClient(app).me());
      expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
    } finally {
      await pool.end();
    }
  });
});
