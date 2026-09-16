import { Predicate } from 'effect';
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
import { composeStudio } from './support/serve.ts';

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

/**
 * The `exit` of the one `Exit` frame in an ndjson `/rpc` response body — the
 * shape `rpc-setup.test.ts` reads a response with, left unnarrowed because the
 * cases below are about how a call was refused rather than what it returned.
 *
 * Note that a refusal is still a 200: the rpc server answers the transport and
 * puts the verdict in the frame, so a case that only read the status would pass
 * on every one of these.
 */
async function exitFrameOf(response: Response): Promise<unknown> {
  const frames = (await response.text())
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line: string): unknown => JSON.parse(line));
  const frame = frames.find(
    (one) => Predicate.hasProperty(one, '_tag') && one._tag === 'Exit',
  );
  if (!Predicate.hasProperty(frame, 'exit')) {
    throw new Error(`no Exit frame in ${JSON.stringify(frames)}`);
  }
  return frame.exit;
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
    // The provider is handed a request rather than a cookie: which headers
    // its endpoint consults is its own business, so the whole set goes
    // through — the header set `createPrincipalMiddleware` passed on the Hono
    // mount. This client talks to the handlers in process, so the set it
    // presents is the only one there is; the case below is where a real
    // request and a message that contradicts it are told apart.
    expect(asked?.get('user-agent')).toBe('Studio Test Agent');
  });

  it('asks the provider with the headers the request carried, not ones a message attached', async () => {
    // `RpcServer` merges each message's own headers over the request's, so
    // `options.headers` is partly caller-supplied. A header a caller attaches
    // with `RpcClient.withHeaders` must not reach the auth provider as though
    // the deployment had received it: with `TRUSTED_PROXIES` set, the address
    // better-auth resolves comes off `x-forwarded-for`, and the forgery would
    // arrive in the request body where no reverse proxy can correct it.
    let asked: Headers | undefined;
    const auth = stubAuthService({
      getSession: (headers) => {
        asked = headers;
        return Promise.resolve(PRINCIPAL);
      },
    });
    // Over the transport, because that is the only place the two sets differ:
    // the in-process client has no HTTP request behind it at all.
    const configured = readEnv();
    const stack = composeStudio(configured, createStudio(configured, { auth }));
    try {
      const response = await stack.request('/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ndjson',
          'sec-fetch-site': 'same-origin',
          'cookie': 'studio.session_token=opaque',
          'user-agent': 'The Real Agent',
        },
        body: `${JSON.stringify({
          _tag: 'Request',
          id: 1,
          tag: 'me',
          payload: null,
          headers: [
            ['user-agent', 'A Forged Agent'],
            ['x-forwarded-for', '203.0.113.9'],
          ],
        })}\n`,
      });
      expect(response.status).toBe(200);

      expect(asked?.get('user-agent')).toBe('The Real Agent');
      // Not overwritten and not invented: a header the request never carried
      // stays absent however loudly the message names it.
      expect(asked?.get('x-forwarded-for')).toBeNull();
      // Still the request's own credential, which is the point of forwarding
      // the set at all.
      expect(asked?.get('cookie')).toBe('studio.session_token=opaque');
    } finally {
      await stack.dispose();
    }
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

  it('refuses the token plane even when the message erases the header', async () => {
    // The bypass a guard reading the merged set leaves open, and the reason
    // the case above cannot stand for this one: it drives the in-process
    // client, where the request's headers and the message's are one set, so it
    // passes whichever set the guard asks.
    //
    // A message's headers are raw `JSON.parse` output — `layerNdjson` parses
    // the envelope and never decodes it against `RequestEncoded` — so a caller
    // may put a one-element entry there, which `Headers.fromInput` merges as
    // `authorization: undefined`. The merged set then answers `undefined` to a
    // `!== undefined` guard while the request still carries a real
    // `Authorization`, and the cookie beside it would be the silent
    // token-to-cookie fallback #1248 forbids.
    let getSessionCalls = 0;
    const auth = stubAuthService({
      getSession: () => {
        getSessionCalls += 1;
        return Promise.resolve(PRINCIPAL);
      },
    });
    const configured = readEnv();
    const stack = composeStudio(configured, createStudio(configured, { auth }));
    try {
      const response = await stack.request('/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ndjson',
          'sec-fetch-site': 'same-origin',
          'cookie': 'studio.session_token=opaque',
          'authorization': 'Bearer real-token',
        },
        body: `${JSON.stringify({
          _tag: 'Request',
          id: 1,
          tag: 'me',
          payload: null,
          // Deliberately not a pair. The wire type says `[string, string]`;
          // nothing on this path enforces it.
          headers: [['authorization']],
        })}\n`,
      });
      expect(response.status).toBe(200);

      expect(await exitFrameOf(response)).toMatchObject({
        _tag: 'Failure',
        cause: [{ _tag: 'Fail', error: { _tag: 'Unauthorized' } }],
      });
      // And refused before the provider was consulted at all: a call that
      // reached `getSession` had already handed it the cookie and the token
      // together, whatever it went on to answer.
      expect(getSessionCalls).toBe(0);
    } finally {
      await stack.dispose();
    }
  });

  it('refuses a payload the contract rejects, at the server boundary', async () => {
    // The server-side half of `expectPayloadRejected` (`support/rpc.ts`),
    // which can only ever see the *client's* encoder refuse: under
    // `RpcTest.makeClient` the payload never leaves the process. Over the
    // transport the bytes arrive as sent, and it is `RpcServer`'s decode that
    // refuses — a different code path, and the one a caller who is not using
    // our client reaches.
    //
    // `setup.complete` because it is public: the refusal has to be the
    // payload's, not a middleware's, and this way nothing else could have
    // produced it.
    const configured = readEnv();
    const stack = composeStudio(
      configured,
      createStudio(configured, { auth: stubAuthService() }),
    );
    try {
      const response = await stack.request('/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ndjson',
          'sec-fetch-site': 'same-origin',
        },
        body: `${JSON.stringify({
          _tag: 'Request',
          id: 1,
          tag: 'setup.complete',
          payload: {
            token: 'a-token',
            // Blank once trimmed, which the contract refuses.
            instanceName: '   ',
            owner: {
              name: 'First Owner',
              email: 'owner@example.test',
              password: 'first-owner-password',
            },
          },
          headers: [],
        })}\n`,
      });
      expect(response.status).toBe(200);

      // A `Die`, not a declared failure: a payload the schema refuses is not
      // one of the procedure's errors.
      const exit = await exitFrameOf(response);
      expect(exit).toMatchObject({
        _tag: 'Failure',
        cause: [{ _tag: 'Die' }],
      });
      // And the defect — `SchemaIssue.defaultFormatter`'s rendering of the
      // refusal — has to name the field. "Died" alone is the same shape a call
      // produces when it is admitted and then throws, which is the argument
      // `expectPayloadRejected` makes for taking `field` at all; here it is
      // also what says the decode refused this payload rather than the
      // envelope around it.
      const defect =
        Predicate.hasProperty(exit, 'cause') &&
        Predicate.hasProperty(exit.cause, 0) &&
        Predicate.hasProperty(exit.cause[0], 'defect')
          ? exit.cause[0].defect
          : undefined;
      expect(defect).toContain('instanceName');
    } finally {
      await stack.dispose();
    }
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
