import { randomUUID } from 'node:crypto';

import { createORPCClient, isDefinedError, safe } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import type { contract } from '@codaco/studio-rpc';

import { createApp } from '../app.ts';
import { resolve } from '../env/resolve.ts';
import type { RawEnv } from '../env/variables.ts';
import { stubAuthService } from './support/auth.ts';
import { reachableRedis, REDIS_DATABASES } from './support/valkey.ts';

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

/** A peer address of its own per case, so no two cases share a bucket. */
function peer(address: string) {
  return {
    incoming: {
      socket: {
        remoteAddress: address,
        remotePort: 51_234,
        remoteFamily: 'IPv4',
      },
    },
  };
}

function appWith(
  overrides: RawEnv,
  principalUserId?: string,
  memberOfTeamId?: string,
) {
  const env = resolve({
    NODE_ENV: 'test',
    ...(url ? { REDIS_URL: url } : {}),
    ...overrides,
  });
  return createApp(env, {
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
  });
}

/** An RPC client that keeps the response so a header can be read off it. */
function rpcClientFor(app: ReturnType<typeof createApp>) {
  const responses: Response[] = [];
  const link = new RPCLink({
    origin: 'http://studio.test',
    url: '/rpc',
    headers: { 'sec-fetch-site': 'same-origin' },
    fetch: async (request, init) => {
      const response = await app.request(request, init);
      responses.push(response);
      return response;
    },
  });
  return {
    client: createORPCClient(link) as RouterContractClient<typeof contract>,
    lastResponse: () => responses.at(-1),
  };
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
    const app = appWith({ RATE_LIMIT_SIGN_IN_EMAIL: '2/1m' });
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
    const app = appWith({ RATE_LIMIT_INVITATION_ACCEPT: '2/1m' }, userId);
    const { client, lastResponse } = rpcClientFor(app);
    const invitationId = randomUUID();

    // Admitted calls fail inside the procedure — there is no database behind
    // this app — which is what proves they got past the limiter.
    const admitted = async () => {
      const { error } = await safe(
        client.team.acceptInvitation({ invitationId }),
      );
      expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    };
    await admitted();
    await admitted();

    const { error } = await safe(
      client.team.acceptInvitation({ invitationId }),
    );
    expect(error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      data: { retryAfter: expect.any(Number) },
    });
    expect(lastResponse()?.status).toBe(429);
    expect(Number(lastResponse()?.headers.get('Retry-After'))).toBeGreaterThan(
      0,
    );

    // Another token is another bucket.
    const other = await safe(
      client.team.acceptInvitation({ invitationId: randomUUID() }),
    );
    expect(other.error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
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
    const app = appWith({ RATE_LIMIT_STORAGE_READ: '2/1m' });
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
    const app = appWith({ RATE_LIMIT_PUBLIC_API: '2/1m' });
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
    const app = appWith({ RATE_LIMIT_PUBLIC_API: '2/1m' });
    const call = (address: string) =>
      app.request('/api/v1/status', {}, peer(address));

    expect((await call('203.0.113.31')).status).toBe(200);
    expect((await call('203.0.113.31')).status).toBe(200);
    await expectProblemJson429(await call('203.0.113.31'));
    expect((await call('203.0.113.32')).status).toBe(200);
  });

  it('refuses a third WebSocket upgrade for one user', async () => {
    const userId = `user-${randomUUID()}`;
    const app = appWith({ RATE_LIMIT_WS_UPGRADE: '2/1m' }, userId);
    const upgrade = () =>
      app.request(
        '/ws',
        { headers: { Upgrade: 'websocket', Connection: 'Upgrade' } },
        peer('203.0.113.41'),
      );

    // The handler behind this needs a real upgrade, which an in-process
    // request is not; what matters is that the first two reached it and the
    // third did not.
    expect((await upgrade()).status).not.toBe(429);
    expect((await upgrade()).status).not.toBe(429);
    await expectProblemJson429(await upgrade());
  });

  it('refuses a third RPC call for one user, with Retry-After on the response', async () => {
    const userId = `user-${randomUUID()}`;
    const app = appWith({ RATE_LIMIT_RPC_USER: '2/1m' }, userId);
    const { client, lastResponse } = rpcClientFor(app);

    await expect(client.me()).resolves.toMatchObject({ userId });
    await expect(client.me()).resolves.toMatchObject({ userId });

    const refused = await safe(client.me());
    expect(refused.error).toBeInstanceOf(Error);
    expect(isDefinedError(refused.error)).toBe(false);
    expect(refused.error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      data: { retryAfter: expect.any(Number) },
    });
    // The header is what a browser's own retry logic reads; the error data is
    // what a call over the WebSocket has instead, because a frame carries no
    // headers.
    const response = lastResponse();
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('charges the team nothing for a caller who is not in it', async () => {
    // Charging the team bucket before the membership lookup would let any
    // signed-in stranger who can guess a team id exhaust that team's quota
    // with calls that are all refused.
    const teamId = `team-${randomUUID()}`;
    const stranger = appWith(
      { RATE_LIMIT_RPC_TEAM: '2/1m', RATE_LIMIT_RPC_USER: '100/1m' },
      `stranger-${randomUUID()}`,
    );
    const outsider = rpcClientFor(stranger).client;
    for (let call = 0; call < 6; call += 1) {
      const { error } = await safe(outsider.studies.list({ teamId }));
      expect(error).toMatchObject({ code: 'FORBIDDEN' });
    }

    // A member of that team still has the whole allowance.
    const member = appWith(
      { RATE_LIMIT_RPC_TEAM: '2/1m', RATE_LIMIT_RPC_USER: '100/1m' },
      `member-${randomUUID()}`,
      teamId,
    );
    const insider = rpcClientFor(member).client;
    for (let call = 0; call < 2; call += 1) {
      const { error } = await safe(insider.studies.list({ teamId }));
      expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    }
    const { error } = await safe(insider.studies.list({ teamId }));
    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('refuses a third protocol-builder call for one user', async () => {
    // Every procedure on that router authenticates through `openSession`
    // rather than `requireUser`, so without the limiter passed in it was the
    // one part of the RPC plane with no per-user limit — including edits over
    // an open WebSocket.
    const userId = `user-${randomUUID()}`;
    const app = appWith({ RATE_LIMIT_RPC_USER: '2/1m' }, userId);
    const { client, lastResponse } = rpcClientFor(app);
    const call = () =>
      safe(client.protocolBuilder.listSections({ protocolId: randomUUID() }));

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await call();
      expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    }
    const { error } = await call();
    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(lastResponse()?.status).toBe(429);
  });

  it('refuses a third RPC call for one team, whoever makes it', async () => {
    const teamId = `team-${randomUUID()}`;
    const app = appWith(
      // The per-user limit is left generous so that what refuses the third
      // call can only be the team's.
      { RATE_LIMIT_RPC_TEAM: '2/1m', RATE_LIMIT_RPC_USER: '100/1m' },
      `user-${randomUUID()}`,
      teamId,
    );
    const { client, lastResponse } = rpcClientFor(app);

    // There is no database behind this app, so an admitted call fails inside
    // the procedure instead — which is exactly what proves it was admitted.
    const admitted = async () => {
      const { error } = await safe(client.studies.list({ teamId }));
      expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    };
    await admitted();
    await admitted();

    const { error } = await safe(client.studies.list({ teamId }));
    expect(error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(lastResponse()?.status).toBe(429);
    expect(Number(lastResponse()?.headers.get('Retry-After'))).toBeGreaterThan(
      0,
    );
  });
});
