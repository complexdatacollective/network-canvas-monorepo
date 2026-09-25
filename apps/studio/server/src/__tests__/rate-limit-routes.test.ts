import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { Cause, Effect, Exit, Option } from 'effect';
import type pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  ProtocolId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';

import { createStudio, type Studio } from '../app.ts';
import type { AuthService } from '../auth/service.ts';
import type { StudioEnv } from '../env.ts';
import { resolve } from '../env/resolve.ts';
import { createProtocolBuilderRuntime } from '../protocol-builder/runtime.ts';
import { RATE_LIMITS, type RateLimitSettings } from '../rate-limit/scopes.ts';
import { createRpcRouter } from '../rpc.ts';
import { authServiceStub } from './support/auth.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { startStudioServer } from './support/serve.ts';
import {
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

// Every limited surface, through the request path a caller actually takes
// (#1909). What the limiter itself decides is in
// src/rate-limit/__tests__/limiter.test.ts; what is here is that each surface
// asks it, with the right subject, and answers a refusal the same way.
//
// None of these needs a database. The limit is taken before anything is read —
// which is the point of a rate limit — so a refused call is a 429 whether or
// not the surface behind it would have worked, and an allowed one reaches the
// surface and is answered by it.

const url = await reachableRedis(REDIS_DATABASES.routes);

/** One connection for the file; each case builds its own limiter over it. */
const store = await openRateLimitStore(url);
afterAll(() => store.dispose());

/**
 * A client address of its own per case, so no two cases share a bucket.
 *
 * The HTTP limits are the Effect router's route middleware, keyed by the
 * address the global `ClientAddress` middleware resolved — so the cases run
 * over a real socket, whose peer is loopback, with loopback trusted as a
 * proxy: the address is then the forwarded one, exactly as it is behind a
 * deployment's reverse proxy. What the resolution itself decides is in
 * src/__tests__/client-address.test.ts.
 */
function peer(address: string): Record<string, string> {
  return { 'x-forwarded-for': address };
}

/** The browser-facing origin these cases configure, which better-auth is handed. */
const PUBLIC_URL = 'http://studio.example:5173';

/** A limit small enough to count to, for the one scope a case is about. */
const perMinute = (max: number) => ({ max, windowMs: 60_000 });

/**
 * The shipped limits with one or two scopes turned down, stated in code
 * (#1909). There is no environment variable behind any of them any more, and
 * counting to the real `storage_read` limit would be two thousand requests.
 */
function appOptions(
  limits: Partial<RateLimitSettings>,
  principalUserId?: string,
  memberOfTeamId?: string,
  handler: Partial<Pick<AuthService['Service'], 'handler'>> = {},
) {
  const resolved = resolve({
    NODE_ENV: 'test',
    TRUSTED_PROXIES: ['127.0.0.1'],
    ...(url ? { REDIS_URL: url } : {}),
  });
  // Auth configured without a database, which the environment's own decode
  // would refuse: nothing here reaches one, and the origin the routes rebuild
  // better-auth's request against is what a case asserts.
  const env: StudioEnv = {
    ...resolved,
    auth: {
      secret: 'a'.repeat(40),
      baseUrl: PUBLIC_URL,
      trustedProxies: ['127.0.0.1'],
      socialProviders: {},
    },
  };
  const deps = {
    limiter: store.limiter(limits),
    // A pool that is never connected to. `openTeam` needs one to exist before
    // it will look a membership up at all, and every procedure behind it fails
    // when it tries to use it — which is what tells an admitted call from a
    // refused one here.
    pool: {} as unknown as pg.Pool,
    auth: authServiceStub(
      principalUserId
        ? {
            ...handler,
            getMembership: (_userId, teamId) =>
              Effect.succeed(
                Option.fromNullishOr(
                  memberOfTeamId && teamId === memberOfTeamId
                    ? { role: 'owner' }
                    : null,
                ),
              ),
            getSession: () =>
              Effect.succeedSome({
                kind: 'user',
                userId: principalUserId,
                email: `${principalUserId}@example.org`,
                emailVerified: true,
                name: 'Researcher',
                locale: null,
                sessionId: `session-${principalUserId}`,
              }),
          }
        : handler,
    ),
  };
  return { env, deps };
}

/**
 * The whole stack on a loopback port, and a request against it from a given
 * client address. `handler` stands in for better-auth's web handler.
 */
async function serverWith(
  limits: Partial<RateLimitSettings>,
  options: {
    readonly principalUserId?: string;
    readonly handler?: AuthService['Service']['handler'];
  } = {},
) {
  const { env, deps } = appOptions(
    limits,
    options.principalUserId,
    undefined,
    options.handler === undefined ? {} : { handler: options.handler },
  );
  const server = await startStudioServer(env, createStudio(env, deps));
  return {
    env,
    request: (address: string, path: string, init: RequestInit = {}) =>
      fetch(`${server.origin}${path}`, {
        ...init,
        headers: { ...peer(address), ...init.headers },
      }),
    dispose: server.dispose,
  };
}

/** A JSON POST, as the SPA's sign-in form sends one. */
const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function studioWith(
  limits: Partial<RateLimitSettings>,
  principalUserId?: string,
  memberOfTeamId?: string,
): Studio {
  const { env, deps } = appOptions(limits, principalUserId, memberOfTeamId);
  return createStudio(env, deps);
}

/**
 * A client on the rpc plane, which is where the `rpc_user`, `rpc_team` and
 * `invitation_accept` limits are charged now.
 *
 * A refusal there is the contract's `RateLimited({ retryAfterSeconds })` and
 * nothing else: the `Retry-After` header the oRPC fetch plane carried is gone
 * by design (design §14, "two failure planes"), because the same procedures
 * are served over a socket, where a frame has no headers to put it in. The
 * HTTP surfaces below keep the header, and their cases are unchanged.
 */
function rpcClientFor(studio: Studio): Promise<RpcTestClient> {
  return createRpcClient(studio);
}

/** The protocol-builder host, still an oRPC router served over `/ws`. */
function builderClientFor(studio: Studio, userId: string) {
  return createRouterClient(
    createRpcRouter({
      ...studio.rpc,
      auth: studio.auth,
      limiter: studio.limiter,
      protocolBuilder: createProtocolBuilderRuntime(),
    }),
    {
      context: {
        principal: {
          kind: 'user',
          userId,
          email: `${userId}@example.org`,
          emailVerified: true,
          name: 'Researcher',
          locale: null,
          sessionId: `session-${userId}`,
        },
        requestId: randomUUID(),
        connectionId: `${userId}-connection`,
        clientSessionId: `${userId}-tab`,
      },
    },
  );
}

/**
 * A call the limiter admitted: there is no database behind these apps, so the
 * procedure behind the limit fails on the pool, and the call dies rather than
 * failing with one of its declared errors. That it got that far is what proves
 * it was admitted — the same thing `INTERNAL_SERVER_ERROR` proved on the oRPC
 * plane.
 */
function expectAdmitted(exit: Exit.Exit<unknown, unknown>): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.hasDies(exit.cause)).toBe(true);
  }
}

/** The shape every refusal takes, whichever surface produced it. */
async function expectProblemJson429(response: Response): Promise<void> {
  expect(response.status).toBe(429);
  expect(response.headers.get('Content-Type')).toContain(
    'application/problem+json',
  );
  const retryAfter = Number(response.headers.get('Retry-After'));
  expect(retryAfter).toBeGreaterThan(0);
  expect(await response.json()).toEqual({
    title: 'Too Many Requests',
    status: 429,
  });
}

describe.skipIf(!url)('the limited request paths', () => {
  it('refuses a third magic-link request for one email address', async () => {
    const server = await serverWith({ sign_in_email: perMinute(2) });
    const email = `researcher-${randomUUID()}@example.org`;
    // Three different addresses, so what refuses the third call can only be
    // the per-email limit.
    const send = (address: string) =>
      server.request(
        address,
        '/api/auth/sign-in/magic-link',
        postJson({ email, callbackURL: '/' }),
      );
    try {
      expect((await send('203.0.113.1')).status).not.toBe(429);
      // Upper case and a trailing slash name the same account on the same
      // endpoint: one bucket.
      expect(
        (
          await server.request(
            '203.0.113.2',
            '/api/auth/sign-in/magic-link/',
            postJson({ email: email.toUpperCase(), callbackURL: '/' }),
          )
        ).status,
      ).not.toBe(429);
      await expectProblemJson429(await send('203.0.113.3'));

      // Another address is another bucket.
      const other = await server.request(
        '203.0.113.4',
        '/api/auth/sign-in/magic-link',
        postJson({ email: `other-${email}`, callbackURL: '/' }),
      );
      expect(other.status).not.toBe(429);
    } finally {
      await server.dispose();
    }
  });

  it('hands better-auth the body the sign-in limit read', async () => {
    // The limit has to read the body to know whose account it is, and the
    // body can be read once: this is what says better-auth still got it.
    const seen: Array<{ url: string; method: string; body: string }> = [];
    const server = await serverWith(
      { sign_in_email: perMinute(1) },
      {
        handler: (request) =>
          Effect.promise(async () => {
            seen.push({
              url: request.url,
              method: request.method,
              body: await request.text(),
            });
            return Response.json({ signedIn: true });
          }),
      },
    );
    const credentials = {
      email: `reader-${randomUUID()}@example.org`,
      password: 'correct horse battery staple',
    };
    try {
      const response = await server.request(
        '203.0.113.6',
        '/api/auth/sign-in/email?from=form',
        postJson(credentials),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ signedIn: true });
      // Mutation: forward the request without its body → `body` is ''.
      expect(seen).toEqual([
        {
          // Rebuilt against the configured origin, not the socket's.
          url: `${PUBLIC_URL}/api/auth/sign-in/email?from=form`,
          method: 'POST',
          body: JSON.stringify(credentials),
        },
      ]);

      // And it was the limit's to spend: the second attempt never reaches
      // better-auth.
      await expectProblemJson429(
        await server.request(
          '203.0.113.7',
          '/api/auth/sign-in/email',
          postJson(credentials),
        ),
      );
      expect(seen).toHaveLength(1);
    } finally {
      await server.dispose();
    }
  });

  it("answers better-auth's own rate limit as problem JSON with Retry-After", async () => {
    // better-auth refuses its per-address limit with a `{ message }` body and
    // `X-Retry-After`; a caller reads every refusal the same way here.
    let retryAfter: string | null = '42';
    const server = await serverWith(
      {},
      {
        handler: () =>
          Effect.succeed(
            Response.json(
              { message: 'Too many requests. Please try again later.' },
              {
                status: 429,
                headers:
                  retryAfter === null ? {} : { 'X-Retry-After': retryAfter },
              },
            ),
          ),
      },
    );
    try {
      const refused = await server.request(
        '203.0.113.8',
        '/api/auth/get-session',
      );
      expect(refused.headers.get('Retry-After')).toBe('42');
      await expectProblemJson429(refused);

      // Without the header, the interval is the per-address window itself.
      retryAfter = null;
      const unstated = await server.request(
        '203.0.113.8',
        '/api/auth/get-session',
      );
      expect(unstated.headers.get('Retry-After')).toBe(
        String(RATE_LIMITS.sign_in_address.windowMs / 1000),
      );
      await expectProblemJson429(unstated);
    } finally {
      await server.dispose();
    }
  });

  it('refuses a third acceptance of one invitation token, on the path the client takes', async () => {
    // Not better-auth's `/organization/accept-invitation`: Studio blocks that
    // route outright (audit/better-auth-policy.ts), so a limit there would
    // guard a 404 and the live path would have none. The client accepts over
    // RPC (client/src/routes/AcceptInvitation.tsx).
    const userId = `user-${randomUUID()}`;
    const client = await rpcClientFor(
      studioWith({ invitation_accept: perMinute(2) }, userId),
    );
    const invitationId = TeamInvitationId.make(randomUUID());
    try {
      const accept = (id = invitationId) =>
        client.callExit(
          client.rpc('team.acceptInvitation', { invitationId: id }),
        );

      expectAdmitted(await accept());
      expectAdmitted(await accept());

      const refused = await expectRpcFailure(accept(), 'RateLimited');
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);

      // Another token is another bucket.
      expectAdmitted(await accept(TeamInvitationId.make(randomUUID())));
    } finally {
      await client.dispose();
    }
  });

  it('refuses the blocked better-auth invitation route outright', async () => {
    // The reason the limit moved: this path answers 404 whatever is sent to
    // it, so nothing guessing a token ever reaches it.
    const server = await serverWith({});
    try {
      const response = await server.request(
        '203.0.113.5',
        '/api/auth/organization/accept-invitation',
        postJson({ invitationId: randomUUID() }),
      );
      expect(response.status).toBe(404);
    } finally {
      await server.dispose();
    }
  });

  it('refuses a third storage read from one client address', async () => {
    const server = await serverWith({ storage_read: perMinute(2) });
    const read = (address: string) =>
      server.request(address, `/storage/${randomUUID()}`);
    try {
      expect((await read('203.0.113.11')).status).not.toBe(429);
      expect((await read('203.0.113.11')).status).not.toBe(429);
      await expectProblemJson429(await read('203.0.113.11'));

      // A different address still reads: the bucket is the caller, not the path.
      expect((await read('203.0.113.12')).status).not.toBe(429);
    } finally {
      await server.dispose();
    }
  });

  it('does not let a rotating Authorization header escape the public API limit', async () => {
    // There is no token plane until #1899, so an Authorization header is an
    // unvalidated string. Keying on it would let an anonymous caller mint a
    // fresh allowance per request by changing the value — the address limit
    // doing nothing at all.
    const server = await serverWith({ public_api: perMinute(2) });
    const call = () =>
      server.request('203.0.113.21', '/api/v1/status', {
        headers: { Authorization: `Bearer ${randomUUID()}` },
      });
    try {
      expect((await call()).status).toBe(200);
      expect((await call()).status).toBe(200);
      await expectProblemJson429(await call());
    } finally {
      await server.dispose();
    }
  });

  it('refuses a third public API call from one address when there is no token', async () => {
    const server = await serverWith({ public_api: perMinute(2) });
    const call = (address: string) => server.request(address, '/api/v1/status');
    try {
      expect((await call('203.0.113.31')).status).toBe(200);
      expect((await call('203.0.113.31')).status).toBe(200);
      await expectProblemJson429(await call('203.0.113.31'));
      expect((await call('203.0.113.32')).status).toBe(200);
    } finally {
      await server.dispose();
    }
  });

  it('refuses a third WebSocket upgrade for one user, from any address', async () => {
    // Keyed by the user the principal gate resolved, not by the address: a
    // tab that reconnects from a new network is the same tab.
    const userId = `user-${randomUUID()}`;
    const server = await serverWith(
      { ws_upgrade: perMinute(2) },
      { principalUserId: userId },
    );
    try {
      const upgrade = (address: string) =>
        server.request(address, '/ws', {
          headers: { origin: new URL(PUBLIC_URL).origin },
        });

      // The route behind the guards needs a real upgrade, which a plain GET
      // is not; what matters is that the first two reached it and the third
      // did not.
      expect((await upgrade('203.0.113.41')).status).not.toBe(429);
      expect((await upgrade('203.0.113.42')).status).not.toBe(429);
      await expectProblemJson429(await upgrade('203.0.113.43'));
    } finally {
      await server.dispose();
    }
  });

  it('refuses a third RPC call for one user, with the interval to wait', async () => {
    const userId = `user-${randomUUID()}`;
    const client = await rpcClientFor(
      studioWith({ rpc_user: perMinute(2) }, userId),
    );
    try {
      await expect(
        client.call(client.rpc('me', undefined)),
      ).resolves.toMatchObject({ userId });
      await expect(
        client.call(client.rpc('me', undefined)),
      ).resolves.toMatchObject({ userId });

      // One refusal, carrying the interval: the `Retry-After` header the fetch
      // plane used to answer with is gone, because these procedures are served
      // over a socket too and a frame carries no headers. The declared error
      // is the one answer both transports can give.
      const refused = await expectRpcFailure(
        client.callExit(client.rpc('me', undefined)),
        'RateLimited',
      );
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await client.dispose();
    }
  });

  it('charges the team nothing for a caller who is not in it', async () => {
    // Charging the team bucket before the membership lookup would let any
    // signed-in stranger who can guess a team id exhaust that team's quota
    // with calls that are all refused.
    const teamId = TeamId.make(`team-${randomUUID()}`);
    const outsider = await rpcClientFor(
      studioWith(
        { rpc_team: perMinute(2), rpc_user: perMinute(100) },
        `stranger-${randomUUID()}`,
      ),
    );
    const insider = await rpcClientFor(
      studioWith(
        { rpc_team: perMinute(2), rpc_user: perMinute(100) },
        `member-${randomUUID()}`,
        teamId,
      ),
    );
    try {
      for (let call = 0; call < 6; call += 1) {
        await expectRpcFailure(
          outsider.callExit(outsider.rpc('studies.list', { teamId })),
          'Forbidden',
        );
      }

      // A member of that team still has the whole allowance.
      for (let call = 0; call < 2; call += 1) {
        expectAdmitted(
          await insider.callExit(insider.rpc('studies.list', { teamId })),
        );
      }
      await expectRpcFailure(
        insider.callExit(insider.rpc('studies.list', { teamId })),
        'RateLimited',
      );
    } finally {
      await outsider.dispose();
      await insider.dispose();
    }
  });

  it('refuses a third protocol-builder call for one user', async () => {
    // Every procedure on that router authenticates through `openSession`
    // rather than `requireUser`, so without the limiter passed in it was the
    // one part of the RPC plane with no per-user limit — including edits over
    // an open WebSocket.
    const userId = `user-${randomUUID()}`;
    // In process rather than over `/rpc`: this router is the protocol-builder
    // host, which is served over `/ws` alone until stage 8. That is also why
    // there is no response status to assert here any more — a frame has none,
    // and the refusal the caller reads is the error itself.
    //
    // `builderClientFor` hands the router a principal outright, so the user
    // the limiter charges is the one this case names rather than one resolved
    // from a session. Nothing here covers the auth path; what it covers is
    // that the limit is charged at all.
    const client = builderClientFor(
      studioWith({ rpc_user: perMinute(2) }, userId),
      userId,
    );
    const call = () =>
      safe(
        client.protocolBuilder.listSections({
          protocolId: ProtocolId.make(randomUUID()),
        }),
      );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await call();
      expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    }
    const { error } = await call();
    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('refuses a third RPC call for one team, whoever makes it', async () => {
    const teamId = TeamId.make(`team-${randomUUID()}`);
    const client = await rpcClientFor(
      studioWith(
        // The per-user limit is left generous so that what refuses the third
        // call can only be the team's.
        { rpc_team: perMinute(2), rpc_user: perMinute(100) },
        `user-${randomUUID()}`,
        teamId,
      ),
    );
    try {
      const list = () =>
        client.callExit(client.rpc('studies.list', { teamId }));
      expectAdmitted(await list());
      expectAdmitted(await list());

      const refused = await expectRpcFailure(list(), 'RateLimited');
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await client.dispose();
    }
  });
});
