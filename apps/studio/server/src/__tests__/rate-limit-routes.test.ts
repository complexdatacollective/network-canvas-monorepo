import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { Cause, Exit } from 'effect';
import type pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  ProtocolId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';

import { createApp, createStudio, type Studio } from '../app.ts';
import { resolve } from '../env/resolve.ts';
import { createProtocolBuilderRuntime } from '../protocol-builder/runtime.ts';
import type { RateLimitSettings } from '../rate-limit/scopes.ts';
import { createRpcRouter } from '../rpc.ts';
import { stubAuthService } from './support/auth.ts';
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
 * A peer address of its own per case, so no two cases share a bucket.
 *
 * The app reads the address the Effect shell resolved off the adapter
 * bindings now (src/http/middleware/client-address.ts does the resolving), so
 * this is that binding rather than the node adapter's connection info. What
 * the resolution itself decides is in src/__tests__/client-address.test.ts.
 */
function peer(address: string) {
  return { clientAddress: address };
}

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
) {
  const env = resolve({
    NODE_ENV: 'test',
    ...(url ? { REDIS_URL: url } : {}),
  });
  const deps = {
    limiter: store.limiter(limits),
    // A pool that is never connected to. `openTeam` needs one to exist before
    // it will look a membership up at all, and every procedure behind it fails
    // when it tries to use it — which is what tells an admitted call from a
    // refused one here.
    pool: {} as unknown as pg.Pool,
    auth: stubAuthService(
      principalUserId
        ? {
            getMembership: (_userId, teamId) =>
              Promise.resolve(
                memberOfTeamId && teamId === memberOfTeamId
                  ? { role: 'owner' }
                  : null,
              ),
            getSession: () =>
              Promise.resolve({
                kind: 'user',
                userId: principalUserId,
                email: `${principalUserId}@example.org`,
                emailVerified: true,
                name: 'Researcher',
                locale: null,
                sessionId: `session-${principalUserId}`,
              }),
          }
        : undefined,
    ),
  };
  return { env, deps };
}

function appWith(
  limits: Partial<RateLimitSettings>,
  principalUserId?: string,
  memberOfTeamId?: string,
) {
  const { env, deps } = appOptions(limits, principalUserId, memberOfTeamId);
  return createApp(env, deps);
}

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
    const app = appWith({ sign_in_email: perMinute(2) });
    const email = `researcher-${randomUUID()}@example.org`;
    const send = () =>
      app.request(
        '/api/auth/sign-in/magic-link',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, callbackURL: '/' }),
        },
        // Two different addresses, so what refuses the third call can only be
        // the per-email limit.
        peer(`203.0.113.${1 + Math.floor(Math.random() * 200)}`),
      );

    expect((await send()).status).not.toBe(429);
    expect((await send()).status).not.toBe(429);
    await expectProblemJson429(await send());

    // Another address is another bucket.
    const other = await app.request(
      '/api/auth/sign-in/magic-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `other-${email}`, callbackURL: '/' }),
      },
      peer('203.0.113.4'),
    );
    expect(other.status).not.toBe(429);
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
    const app = appWith({});
    const response = await app.request(
      '/api/auth/organization/accept-invitation',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId: randomUUID() }),
      },
      peer('203.0.113.5'),
    );
    expect(response.status).toBe(404);
  });

  it('refuses a third storage read from one client address', async () => {
    const app = appWith({ storage_read: perMinute(2) });
    const address = '203.0.113.11';
    const read = () =>
      app.request(`/storage/${randomUUID()}`, {}, peer(address));

    expect((await read()).status).not.toBe(429);
    expect((await read()).status).not.toBe(429);
    await expectProblemJson429(await read());

    // A different address still reads: the bucket is the caller, not the path.
    expect(
      (await app.request(`/storage/${randomUUID()}`, {}, peer('203.0.113.12')))
        .status,
    ).not.toBe(429);
  });

  it('does not let a rotating Authorization header escape the public API limit', async () => {
    // There is no token plane until #1899, so an Authorization header is an
    // unvalidated string. Keying on it would let an anonymous caller mint a
    // fresh allowance per request by changing the value — the address limit
    // doing nothing at all.
    const app = appWith({ public_api: perMinute(2) });
    const call = () =>
      app.request(
        '/api/v1/status',
        { headers: { Authorization: `Bearer ${randomUUID()}` } },
        peer('203.0.113.21'),
      );

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    await expectProblemJson429(await call());
  });

  it('refuses a third public API call from one address when there is no token', async () => {
    const app = appWith({ public_api: perMinute(2) });
    const call = (address: string) =>
      app.request('/api/v1/status', {}, peer(address));

    expect((await call('203.0.113.31')).status).toBe(200);
    expect((await call('203.0.113.31')).status).toBe(200);
    await expectProblemJson429(await call('203.0.113.31'));
    expect((await call('203.0.113.32')).status).toBe(200);
  });

  it('refuses a third WebSocket upgrade for one user', async () => {
    // Through the composed server, because the upgrade guards answer through
    // the Effect shell's bridge now (src/http/ws-bridge.ts).
    const userId = `user-${randomUUID()}`;
    const { env, deps } = appOptions({ ws_upgrade: perMinute(2) }, userId);
    const { origin, dispose } = await startStudioServer(
      env,
      createStudio(env, deps),
    );
    try {
      const upgrade = () =>
        fetch(`${origin}/ws`, {
          headers: { origin: new URL(env.auth?.baseUrl ?? origin).origin },
        });

      // The route behind the guards needs a real upgrade, which a plain GET
      // is not; what matters is that the first two reached it and the third
      // did not.
      expect((await upgrade()).status).not.toBe(429);
      expect((await upgrade()).status).not.toBe(429);
      await expectProblemJson429(await upgrade());
    } finally {
      await dispose();
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
