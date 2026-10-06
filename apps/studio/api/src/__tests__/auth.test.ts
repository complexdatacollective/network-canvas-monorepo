import { randomUUID } from 'node:crypto';

import { Cause, Effect, Exit, Option, Predicate } from 'effect';
import { type Headers, HttpServerRequest } from 'effect/http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TeamId } from '@codaco/studio-contract/schema/ids';
import { AUTH_NOT_CONFIGURED_PROBLEM_TYPE } from '@codaco/studio-contract/schema/problem';

import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD,
  seed,
} from '../../scripts/seed/seed.ts';
import { createStudio, type Studio } from '../app.ts';
import { principalFromRequest } from '../auth/principal.ts';
import { AuthService, type SessionPrincipal } from '../auth/service.ts';
import { readEnv, type StudioEnv } from '../env.ts';
import {
  authServiceStub,
  liveAuthService,
  signInWithMagicLink,
} from './support/auth.ts';
import {
  openTestDatabase,
  ownerAffected,
  ownerRows,
  refusalOf,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import { createRpcClient, expectRpcFailure } from './support/rpc.ts';
import { testCipher, testKeyring } from './support/secrets.ts';
import { composeStudio } from './support/serve.ts';
import {
  type OpenRateLimitStore,
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

async function meOver(studio: Studio, headers?: Record<string, string>) {
  const client = await createRpcClient(studio, headers);
  try {
    return await client.call(client.rpc('me', undefined));
  } finally {
    await client.dispose();
  }
}

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
  locale: 'en-GB',
  sessionId: 'session-1',
};

describe('principal resolution', () => {
  it('resolves the cookie session into the RPC context', async () => {
    const auth = authServiceStub({
      getSession: () => Effect.succeedSome(PRINCIPAL),
      listMemberships: () =>
        Effect.succeed([
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
    let asked: Headers.Headers | undefined;
    const auth = authServiceStub({
      getSession: (headers) => {
        asked = headers;
        return Effect.succeedSome(PRINCIPAL);
      },
    });
    const me = await meOver(createStudio(readEnv(), { auth }), {
      'cookie': 'studio.session_token=opaque',
      'user-agent': 'Studio Test Agent',
    });
    expect(me.userId).toBe('user-1');
    expect(asked?.['cookie']).toBe('studio.session_token=opaque');
    expect(asked?.['user-agent']).toBe('Studio Test Agent');
  });

  it('asks the provider with the headers the request carried, not ones a message attached', async () => {
    let asked: Headers.Headers | undefined;
    const auth = authServiceStub({
      getSession: (headers) => {
        asked = headers;
        return Effect.succeedSome(PRINCIPAL);
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

      expect(asked?.['user-agent']).toBe('The Real Agent');
      expect(asked?.['x-forwarded-for']).toBeUndefined();
      expect(asked?.['cookie']).toBe('studio.session_token=opaque');
    } finally {
      await stack.dispose();
    }
  });

  it('refuses protected procedures without a session', async () => {
    const auth = authServiceStub();
    await expectMeUnauthorized(createStudio(readEnv(), { auth }));
  });

  it('never falls back to the cookie when an Authorization header is present', async () => {
    let getSessionCalls = 0;
    const auth = authServiceStub({
      getSession: () => {
        getSessionCalls += 1;
        return Effect.succeedSome(PRINCIPAL);
      },
    });
    const studio = createStudio(readEnv(), { auth });

    const me = await meOver(studio);
    expect(me.userId).toBe('user-1');

    await expectMeUnauthorized(studio, { authorization: 'Bearer some-token' });
    expect(getSessionCalls).toBe(1);
  });

  it('resolves an HTTP request by the same rule, token plane included', async () => {
    let getSessionCalls = 0;
    const auth = authServiceStub({
      getSession: () => {
        getSessionCalls += 1;
        return Effect.succeedSome(PRINCIPAL);
      },
    });
    const resolveFor = (headers: Record<string, string>) =>
      Effect.runPromise(
        principalFromRequest.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(
              new Request('http://studio.test/storage/x', { headers }),
            ),
          ),
          Effect.provideService(AuthService, auth),
        ),
      );

    expect(await resolveFor({ cookie: 'studio.session_token=opaque' })).toEqual(
      Option.some(PRINCIPAL),
    );
    expect(getSessionCalls).toBe(1);

    expect(
      await resolveFor({
        cookie: 'studio.session_token=opaque',
        authorization: 'Bearer some-token',
      }),
    ).toEqual(Option.none());
    expect(getSessionCalls).toBe(1);
  });

  it('refuses the token plane even when the message erases the header', async () => {
    let getSessionCalls = 0;
    const auth = authServiceStub({
      getSession: () => {
        getSessionCalls += 1;
        return Effect.succeedSome(PRINCIPAL);
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
      expect(getSessionCalls).toBe(0);
    } finally {
      await stack.dispose();
    }
  });

  it('refuses a payload the contract rejects, at the server boundary', async () => {
    const configured = readEnv();
    const stack = composeStudio(
      configured,
      createStudio(configured, { auth: authServiceStub() }),
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

      const exit = await exitFrameOf(response);
      expect(exit).toMatchObject({
        _tag: 'Failure',
        cause: [{ _tag: 'Die' }],
      });
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

function expectAdmitted(exit: Exit.Exit<unknown, unknown>): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true);
}

const planeRedis = await reachableRedis(REDIS_DATABASES.authPlane);

describe.skipIf(!planeRedis)('what the middleware charges', () => {
  let limits: OpenRateLimitStore;
  beforeAll(async () => {
    limits = await openRateLimitStore(planeRedis);
  });
  afterAll(() => limits.dispose());

  const caller = (): SessionPrincipal => {
    const userId = `plane-${randomUUID()}`;
    return { ...PRINCIPAL, userId, sessionId: `session-${userId}` };
  };

  it('refuses a spent caller before the handler reads anything', async () => {
    const principal = caller();
    const reads = { memberships: 0, membership: 0 };
    const studio = createStudio(readEnv(), {
      auth: authServiceStub({
        getSession: () => Effect.succeedSome(principal),
        listMemberships: () =>
          Effect.sync(() => {
            reads.memberships += 1;
            return [];
          }),
        getMembership: () =>
          Effect.sync(() => {
            reads.membership += 1;
            return Option.some({ role: 'owner' });
          }),
      }),
      limiter: limits.limiter({ rpc_user: { max: 1, windowMs: 60_000 } }),
    });
    const client = await createRpcClient(studio);
    try {
      await client.call(client.rpc('me', undefined));
      expect(reads.memberships).toBe(1);

      const refused = await expectRpcFailure(
        client.callExit(client.rpc('me', undefined)),
        'RateLimited',
      );
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      await expectRpcFailure(
        client.callExit(
          client.rpc('studies.list', { teamId: TeamId.make('team-a') }),
        ),
        'RateLimited',
      );
      expect(reads).toEqual({ memberships: 1, membership: 0 });
    } finally {
      await client.dispose();
    }
  });

  it('charges a team procedure once, in the middleware, and not again in the scope helper', async () => {
    const principal = caller();
    const studio = createStudio(readEnv(), {
      auth: authServiceStub({
        getSession: () => Effect.succeedSome(principal),
        getMembership: () => Effect.succeedSome({ role: 'owner' }),
      }),
      limiter: limits.limiter({ rpc_user: { max: 2, windowMs: 60_000 } }),
    });
    const client = await createRpcClient(studio);
    const list = () =>
      client.callExit(
        client.rpc('studies.list', { teamId: TeamId.make('team-a') }),
      );
    try {
      expectAdmitted(await list());
      expectAdmitted(await list());
      await expectRpcFailure(list(), 'RateLimited');
    } finally {
      await client.dispose();
    }
  });
});

describe('unconfigured auth', () => {
  const env: StudioEnv = {
    port: 3000,
    host: '0.0.0.0',
    workerHealthPort: 3001,
    objectStore: undefined,
    db: undefined,
    auth: undefined,
    mail: undefined,
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
    const stack = composeStudio(env, createStudio(env));
    const res = await stack
      .request('/api/auth/session', { method: 'GET' })
      .finally(() => stack.dispose());
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
    expect(await res.json()).toMatchObject({
      type: AUTH_NOT_CONFIGURED_PROBLEM_TYPE,
    });
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

// Runs in its own Postgres schema: clearing the rate-limit table in the
// shared database would delete durable security counters.

const env = readEnv();

function callBetterAuthOrganizationRoute(
  auth: AuthService['Service'],
  path: `/api/auth/organization/${string}`,
  cookie: string,
  body: object,
): Promise<Response> {
  if (!env.auth) throw new Error('dev env must configure auth');
  return Effect.runPromise(
    auth.handler(
      new Request(new URL(path, env.auth.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': env.auth.baseUrl,
          cookie,
        },
        body: JSON.stringify(body),
      }),
    ),
  );
}

describe.skipIf(!testDb)('magic-link sign-in', () => {
  it('queues the email for the worker rather than sending it', async () => {
    const database = await openTestDatabase();
    try {
      const app = composeStudio(
        env,
        createStudio(env, {
          auth: liveAuthService(env, database.services),
          services: database.services,
        }),
      );
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

      const queued = await database.run(
        ownerRows<{
          queue: string;
          payload: unknown;
        }>(`select queue, payload from ${database.harness.jobSchema}.jobs`),
      );
      expect(queued).toEqual([
        {
          queue: 'sign-in-email',
          payload: {
            email,
            url: expect.stringContaining('/api/auth/magic-link'),
          },
        },
      ]);

      const { url } = queued[0]!.payload as { url: string };
      const verify = await app.request(url);
      expect([302, 200]).toContain(verify.status);
      expect(verify.headers.get('set-cookie')).toBeTruthy();
      await app.dispose();
    } finally {
      await database.dispose();
    }
  });

  it('signs in end to end: send, verify, session, me', async () => {
    const database = await openTestDatabase();
    try {
      const { studio, email, cookie } = await signInWithMagicLink(
        env,
        'researcher',
        database.services,
      );

      const me = await meOver(studio, { cookie });
      expect(me.email).toBe(email);
      expect(me.emailVerified).toBe(true);

      await expectMeUnauthorized(studio);
    } finally {
      await database.dispose();
    }
  });
});

describe.skipIf(!testDb)('email/password sign-in', () => {
  const SEEDING_TIMEOUT_MS = 180_000;

  const SIGN_IN_ALLOWANCE = { max: 1000, windowMs: 60_000 };

  let database: TestDatabaseRuntime | undefined;
  let limits: OpenRateLimitStore | undefined;
  let studio: Studio;
  let stack: ReturnType<typeof composeStudio> | undefined;

  const signIn = (password: string) => {
    if (!env.auth || !stack) throw new Error('dev env must configure auth');
    return stack.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': env.auth.baseUrl,
      },
      body: JSON.stringify({ email: SEED_ADMIN_EMAIL, password }),
    });
  };

  beforeAll(async () => {
    if (!testDb) return;
    if (!env.auth) throw new Error('dev env must configure auth');
    database = await openTestDatabase();
    await database.run(seed({ scale: 'tiny', secrets: testKeyring() }));
    limits = await openRateLimitStore(env.redis);
    studio = createStudio(env, {
      auth: liveAuthService(env, database.services, { cipher: testCipher() }),
      limiter: limits.limiter({ sign_in_email: SIGN_IN_ALLOWANCE }),
    });
    stack = composeStudio(env, studio);
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    await stack?.dispose();
    await database?.dispose();
    await limits?.dispose();
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

describe.skipIf(!testDb)('teams (organization plugin)', () => {
  it('creates a team and resolves the creator membership', async () => {
    const database = await openTestDatabase();
    try {
      const { studio, auth, cookie } = await signInWithMagicLink(
        env,
        'owner',
        database.services,
      );
      const me = await meOver(studio, { cookie });

      // Call the plugin handler directly: Studio's public forwarding boundary
      // blocks organization creation.
      const create = await callBetterAuthOrganizationRoute(
        auth,
        '/api/auth/organization/create',
        cookie,
        { name: 'My Study Group', slug: 'my-studies' },
      );
      expect(create.status).toBe(200);
      const team = (await create.json()) as { id: string; slug: string };
      expect(team.slug).toBe('my-studies');

      const membership = (userId: string, teamId: string) =>
        Effect.runPromise(auth.getMembership(userId, teamId));
      expect(await membership(me.userId, team.id)).toEqual(
        Option.some({ role: 'owner' }),
      );
      expect(await membership(me.userId, 'not-a-team')).toEqual(Option.none());
      expect(await membership('someone-else', team.id)).toEqual(Option.none());

      const refused = await database.run(
        refusalOf(
          ownerAffected(
            `insert into team_members (id, team_id, user_id, role)
             values ($1, $2, $3, 'member')`,
            ['second-membership', team.id, me.userId],
          ),
        ),
      );
      expect(refused.message).toMatch(/duplicate key/);
    } finally {
      await database.dispose();
    }
  });

  it('refuses to delete a team, as its tenant data cannot be deleted with it', async () => {
    const database = await openTestDatabase();
    try {
      const { auth, cookie } = await signInWithMagicLink(
        env,
        'owner',
        database.services,
      );
      const create = await callBetterAuthOrganizationRoute(
        auth,
        '/api/auth/organization/create',
        cookie,
        { name: 'Doomed', slug: 'doomed' },
      );
      expect(create.status).toBe(200);
      const team = (await create.json()) as { id: string };

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

      const survivors = await database.run(
        ownerRows(`select id from teams where id = $1`, [team.id]),
      );
      expect(survivors).toHaveLength(1);
    } finally {
      await database.dispose();
    }
  });
});
