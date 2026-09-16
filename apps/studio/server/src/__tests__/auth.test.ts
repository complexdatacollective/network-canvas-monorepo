import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp, createStudio, type Studio } from '../app.ts';
import { createBetterAuthService } from '../auth/better-auth.ts';
import type { AuthService, SessionPrincipal } from '../auth/service.ts';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, seed } from '../db/seed.ts';
import { readEnv, type StudioEnv } from '../env.ts';
import { signInWithMagicLink, stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';
import { createRpcClient, expectRpcFailure } from './support/rpc.ts';
import { testCipher, testKeyring } from './support/secrets.ts';

/** `me` over the rpc plane, with the harness disposed however the case ends. */
async function meOver(studio: Studio, headers?: Record<string, string>) {
  const client = await createRpcClient(studio, headers);
  try {
    return await client.call(client.rpc('me', undefined));
  } finally {
    await client.dispose();
  }
}

/** The same call, asserted to be refused as `Unauthorized`. */
async function expectMeUnauthorized(
  studio: Studio,
  headers?: Record<string, string>,
): Promise<void> {
  const client = await createRpcClient(studio, headers);
  try {
    await expectRpcFailure(
      client.callExit(client.rpc('me', undefined)),
      'Unauthorized',
    );
  } finally {
    await client.dispose();
  }
}

/** The instance descriptor over the rpc plane. */
async function statusOver(studio: Studio) {
  const client = await createRpcClient(studio);
  try {
    return await client.call(client.rpc('status', undefined));
  } finally {
    await client.dispose();
  }
}

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'user-1',
  email: 'researcher@example.com',
  emailVerified: true,
  name: 'Researcher',
  // Non-null so `me` passing the preference through is observable below.
  locale: 'en-GB',
  sessionId: 'session-1',
};

describe('principal resolution', () => {
  it('resolves the cookie session into the RPC context', async () => {
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      // Better Auth's own team list drops the caller's role, so `me` is what
      // carries it — including a legacy membership stored as one
      // comma-separated value, which the wire schema takes as a plain string
      // rather than rejecting the whole response over.
      listMemberships: () =>
        Promise.resolve([
          { teamId: 'team-a', role: 'owner' },
          { teamId: 'team-b', role: 'admin,member' },
        ]),
    });
    const me = await meOver(createStudio(readEnv(), { auth }));
    expect(me).toEqual({
      userId: 'user-1',
      email: 'researcher@example.com',
      emailVerified: true,
      name: 'Researcher',
      locale: 'en-GB',
      teams: [
        { teamId: 'team-a', role: 'owner' },
        { teamId: 'team-b', role: 'admin,member' },
      ],
    });
  });

  it('asks the provider with the request headers, not the cookie alone', async () => {
    let asked: Headers | undefined;
    const auth = stubAuthService({
      getSession: (headers) => {
        asked = headers;
        return Promise.resolve(PRINCIPAL);
      },
    });
    const me = await meOver(createStudio(readEnv(), { auth }), {
      'cookie': 'studio.session_token=opaque',
      'user-agent': 'Studio Test Agent',
    });
    expect(me.userId).toBe('user-1');
    expect(asked?.get('cookie')).toBe('studio.session_token=opaque');
    // Better Auth reads the address and the agent off the headers it is
    // handed when it refreshes a session, so forwarding the cookie alone
    // would rewrite every refreshed session row with neither. This is the
    // header set `createPrincipalMiddleware` passed on the Hono mount.
    expect(asked?.get('user-agent')).toBe('Studio Test Agent');
  });

  it('refuses protected procedures without a session', async () => {
    const auth = stubAuthService();
    await expectMeUnauthorized(createStudio(readEnv(), { auth }));
  });

  it('never falls back to the cookie when an Authorization header is present', async () => {
    let getSessionCalls = 0;
    const auth = stubAuthService({
      getSession: () => {
        getSessionCalls += 1;
        return Promise.resolve(PRINCIPAL);
      },
    });
    const studio = createStudio(readEnv(), { auth });

    const me = await meOver(studio);
    expect(me.userId).toBe('user-1');

    // With the header, the request is on the token plane (#1248): the cookie
    // session must not even be consulted.
    await expectMeUnauthorized(studio, { authorization: 'Bearer some-token' });
    expect(getSessionCalls).toBe(1);
  });

  it('reports auth capabilities in the RPC status', async () => {
    const status = await statusOver(createStudio());
    expect(status.auth).toEqual({
      enabled: true,
      magicLink: true,
      emailAndPassword: true,
      socialProviders: [],
    });
  });

  it('offers magic-link sign-in even where no mail transport is configured', async () => {
    // Delivery is the worker's (#1895): with no transport anywhere, a sign-in
    // email waits on the queue rather than the method being withdrawn. The
    // capability answers whether the method exists, and `mail` is the worker's
    // resolution — the web process's read leaves it undefined entirely.
    const base = readEnv();
    const status = await statusOver(
      createStudio({ ...base, mail: { kind: 'refuse' } }),
    );
    expect(status.auth.magicLink).toBe(true);
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
    const status = await statusOver(createStudio(withProviders));
    expect(status.auth.socialProviders).toEqual(['google', 'microsoft']);
  });
});

describe('unconfigured auth', () => {
  const env: StudioEnv = {
    port: 3000,
    host: '0.0.0.0',
    workerHealthPort: 3001,
    s3: undefined,
    db: undefined,
    auth: undefined,
    mail: undefined,
    // No database, so nothing to hold a secret and nothing to encrypt it with.
    secrets: undefined,
    redis: undefined,
    trustedProxies: undefined,
    devDefaults: false,
    telemetry: true,
    telemetryEndpoint: undefined,
    deploymentMode: 'self-hosted',
    seedAdminPassword: undefined,
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
    const status = await statusOver(createStudio(env));
    expect(status.auth).toEqual({
      enabled: false,
      magicLink: false,
      emailAndPassword: false,
      socialProviders: [],
    });
  });

  it('refuses protected procedures', async () => {
    await expectMeUnauthorized(createStudio(env));
  });
});

// Runs in its own Postgres schema, like the fingerprint suite: this test
// needs an empty rate-limit table to start from, and clearing that in the
// shared database would delete durable security counters from whatever
// DATABASE_URL happens to point at.

const env = readEnv();

const db = await reachableDb();

function callBetterAuthOrganizationRoute(
  auth: AuthService,
  path: `/api/auth/organization/${string}`,
  cookie: string,
  body: object,
): Promise<Response> {
  if (!env.auth) throw new Error('dev env must configure auth');
  return auth.handler(
    new Request(new URL(path, env.auth.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth.baseUrl,
        cookie,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe.skipIf(!db)('magic-link sign-in', () => {
  it('queues the email for the worker rather than sending it', async () => {
    if (!db) throw new Error('unreachable');
    const scratch = await createScratchSchema(db);
    try {
      await provisionScratchSchema(scratch.pool);
      const jobs = await scratch.createJobClient();
      // The production wiring: createApp builds the auth service from the
      // pool and the job client, and no mailer exists for it to reach for —
      // src/__tests__/process-separation.test.ts pins that nodemailer is not
      // even in this process's module graph.
      const app = createApp(env, { jobs, pool: scratch.app });
      const email = `queued-${Date.now()}@example.com`;

      const send = await app.request('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'http://localhost:5173',
        },
        body: JSON.stringify({ email, callbackURL: '/' }),
      });
      expect(send.status).toBe(200);

      const queued = await scratch.pool.query<{
        queue: string;
        payload: unknown;
      }>(`select queue, payload from ${scratch.jobSchema}.jobs`);
      expect(queued.rows).toEqual([
        {
          queue: 'sign-in-email',
          payload: {
            email,
            url: expect.stringContaining('/api/auth/magic-link'),
          },
        },
      ]);

      // The link in the payload is the real one: the worker sends what is
      // here, so a job carrying anything else would sign nobody in.
      const { url } = queued.rows[0]!.payload as { url: string };
      const verify = await app.request(url);
      expect([302, 200]).toContain(verify.status);
      expect(verify.headers.get('set-cookie')).toBeTruthy();
    } finally {
      await scratch.dispose();
    }
  });

  it('signs in end to end: send, verify, session, me', async () => {
    if (!db) throw new Error('unreachable');
    const scratch = await createScratchSchema(db);
    try {
      await provisionScratchSchema(scratch.pool);
      const { studio, email, cookie } = await signInWithMagicLink(
        env,
        scratch.app,
        'researcher',
      );

      const me = await meOver(studio, { cookie });
      expect(me.email).toBe(email);
      expect(me.emailVerified).toBe(true);

      await expectMeUnauthorized(studio);
    } finally {
      await scratch.dispose();
    }
  });
});

describe.skipIf(!db)('email/password sign-in', () => {
  // Exercises the seed script's credential account (src/db/seed.ts) against
  // the real better-auth handler end to end — the same path that regressed
  // silently when the account table did not match better-auth's own account
  // key (auth-schema.ts), because until this account existed nothing in this
  // suite ever queried that table by provider.
  //
  // Seeded once for every case here; none of them writes anything another can
  // see. `tiny` because these cases need the admin, a team and that team's
  // tenant data — not the demo corpus's volume — and a demo seed is most of a
  // second here and well over a minute on the CI runner, where every affected
  // package's vitest workers share two vCPUs with the Postgres service
  // container. The bound stays generous: it is here to fail a seed that has
  // hung, not one sharing a machine.
  const SEEDING_TIMEOUT_MS = 180_000;

  /** Well past what this file asks for, so repeated local runs never meet it. */
  const SIGN_IN_ALLOWANCE = { max: 1000, windowMs: 60_000 };

  let scratch: Awaited<ReturnType<typeof createScratchSchema>> | undefined;
  let studio: Studio;

  const signIn = (password: string) => {
    if (!env.auth) throw new Error('dev env must configure auth');
    return studio.app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth.baseUrl,
      },
      body: JSON.stringify({ email: SEED_ADMIN_EMAIL, password }),
    });
  };

  beforeAll(async () => {
    if (!db) return;
    if (!env.auth) throw new Error('dev env must configure auth');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    await seed(scratch.pool, { scale: 'tiny', secrets: testKeyring() });
    const auth = createBetterAuthService(
      env.auth,
      scratch.pool,
      () => Promise.resolve(),
      testCipher(),
    );
    // Every case here signs the one seeded account in, so they all count
    // against one `sign_in_email` bucket — and the shipped limit is five in
    // ten minutes, which a developer re-running this file would reach on the
    // third run. The limiter is not what this file is about, so it states a
    // limit of its own rather than sharing the constant's window (#1909).
    studio = createStudio(env, {
      auth,
      limits: { sign_in_email: SIGN_IN_ALLOWANCE },
    });
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    await scratch?.dispose();
  });

  it('signs the seeded admin in with the published password', async () => {
    const response = await signIn(SEED_ADMIN_PASSWORD);
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    const cookie = (setCookie ?? '').split(';')[0]!;

    const me = await meOver(studio, { cookie });
    expect(me.email).toBe(SEED_ADMIN_EMAIL);
  });

  it('refuses a wrong password with a generic error', async () => {
    const response = await signIn('not-the-password');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_EMAIL_OR_PASSWORD',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe.skipIf(!db)('teams (organization plugin)', () => {
  it('creates a team and resolves the creator membership', async () => {
    if (!db) throw new Error('unreachable');
    const scratch = await createScratchSchema(db);
    try {
      await provisionScratchSchema(scratch.pool);
      const { studio, auth, cookie } = await signInWithMagicLink(
        env,
        scratch.app,
        'owner',
      );
      const me = await meOver(studio, { cookie });

      // Call the plugin handler directly in this integration test. Studio's
      // public forwarding boundary blocks organization creation until the
      // application owns an audited command, while this still exercises the
      // adapter against the folded team tables end to end.
      const create = await callBetterAuthOrganizationRoute(
        auth,
        '/api/auth/organization/create',
        cookie,
        { name: 'My Study Group', slug: 'my-studies' },
      );
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

  it('refuses to delete a team, as its tenant data cannot be deleted with it', async () => {
    if (!db) throw new Error('unreachable');
    const scratch = await createScratchSchema(db);
    try {
      await provisionScratchSchema(scratch.pool);
      const { auth, cookie } = await signInWithMagicLink(
        env,
        scratch.app,
        'owner',
      );
      const create = await callBetterAuthOrganizationRoute(
        auth,
        '/api/auth/organization/create',
        cookie,
        { name: 'Doomed', slug: 'doomed' },
      );
      expect(create.status).toBe(200);
      const team = (await create.json()) as { id: string };

      // The owner would otherwise be allowed to delete it, orphaning every
      // sync-side row that names the team without a foreign key.
      const deleted = await callBetterAuthOrganizationRoute(
        auth,
        '/api/auth/organization/delete',
        cookie,
        { organizationId: team.id },
      );
      expect(deleted.status).not.toBe(200);
      expect(await deleted.json()).toMatchObject({
        code: 'ORGANIZATION_DELETION_DISABLED',
      });

      const survivors = await scratch.pool.query(
        `select id from teams where id = $1`,
        [team.id],
      );
      expect(survivors.rowCount).toBe(1);
    } finally {
      await scratch.dispose();
    }
  });
});
