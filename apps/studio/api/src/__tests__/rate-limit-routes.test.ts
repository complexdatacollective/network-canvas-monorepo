import { randomUUID } from 'node:crypto';

import {
  Cause,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Redacted,
  Result,
} from 'effect';
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
import { RATE_LIMITS, type RateLimitSettings } from '../rate-limit/scopes.ts';
import { authServiceStub } from './support/auth.ts';
import { createProtocolBuilderClient } from './support/protocol-builder.ts';
import { rawRequest } from './support/raw-http.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { composeStudio, startStudioServer } from './support/serve.ts';
import { absentDataServices } from './support/services.ts';
import {
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

const url = await reachableRedis(REDIS_DATABASES.routes);

const store = await openRateLimitStore(url);
afterAll(() => store.dispose());

function peer(address: string): Record<string, string> {
  return { 'x-forwarded-for': address };
}

const PUBLIC_URL = 'http://studio.example:5173';

const perMinute = (max: number) => ({ max, windowMs: 60_000 });

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
    services: Effect.runSync(Effect.scoped(Layer.build(absentDataServices))),
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
                email: Redacted.make(`${principalUserId}@example.org`),
                emailVerified: true,
                name: Redacted.make('Researcher'),
                locale: null,
                sessionId: `session-${principalUserId}`,
              }),
          }
        : handler,
    ),
  };
  return { env, deps };
}

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
    raw: (address: string, path: string, method = 'GET') =>
      rawRequest(server.origin, path, { method, headers: peer(address) }),
    dispose: server.dispose,
  };
}

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

function rpcClientFor(studio: Studio): Promise<RpcTestClient> {
  return createRpcClient(studio);
}

function expectAdmitted(exit: Exit.Exit<unknown, unknown>): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.hasDies(exit.cause)).toBe(true);
  }
}

function expectBuilderRateLimited(exit: Exit.Exit<unknown, unknown>): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isSuccess(exit)) return;
  const defect = Cause.findDefect(exit.cause);
  if (Result.isFailure(defect)) {
    expect.unreachable(
      `expected a RateLimited defect, but the call did not die: ${Cause.pretty(exit.cause)}`,
    );
  }
  expect(
    Predicate.hasProperty(defect.success, '_tag') && defect.success._tag,
  ).toBe('RateLimited');
  expect(
    Predicate.hasProperty(defect.success, 'retryAfterSeconds') &&
      defect.success.retryAfterSeconds,
  ).toBeGreaterThan(0);
}

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
    const send = (address: string) =>
      server.request(
        address,
        '/api/auth/sign-in/magic-link',
        postJson({ email, callbackURL: '/' }),
      );
    try {
      expect((await send('203.0.113.1')).status).not.toBe(429);
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
      expect(seen).toEqual([
        {
          url: `${PUBLIC_URL}/api/auth/sign-in/email?from=form`,
          method: 'POST',
          body: JSON.stringify(credentials),
        },
      ]);

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

  it('refuses a sign-in body over the cap before better-auth sees it', async () => {
    // In process: over a socket the server's early answer closes it under the
    // client's write, which fetch reports as a failure.
    let reached = 0;
    const { env, deps } = appOptions({}, undefined, undefined, {
      handler: () =>
        Effect.sync(() => {
          reached += 1;
          return Response.json({ signedIn: true });
        }),
    });
    const stack = composeStudio(env, createStudio(env, deps));
    const chunk = new TextEncoder().encode(' '.repeat(64 * 1024));
    let sent = 0;
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 4 * 1024 * 1024) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversized,
      duplex: 'half',
    };
    try {
      const response = await stack.request('/api/auth/sign-in/email', init);
      expect(response.status).toBe(413);
      expect(response.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
      expect(await response.json()).toEqual({
        title: 'Content Too Large',
        status: 413,
      });
      expect(reached).toBe(0);
      expect(sent).toBeGreaterThan(1024 * 1024);
      expect(sent).toBeLessThanOrEqual(1024 * 1024 + 3 * chunk.byteLength);
    } finally {
      await stack.dispose();
    }
  });

  it("answers better-auth's own rate limit as problem JSON with Retry-After", async () => {
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

      expectAdmitted(await accept(TeamInvitationId.make(randomUUID())));
    } finally {
      await client.dispose();
    }
  });

  it('refuses the blocked better-auth invitation route outright', async () => {
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

      expect((await read('203.0.113.12')).status).not.toBe(429);
    } finally {
      await server.dispose();
    }
  });

  it('does not let a rotating Authorization header escape the public API limit', async () => {
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

  it.each([
    ['the OpenAPI document', '203.0.113.33', '/api/v1/openapi.json', 200],
    ['a path that is no route', '203.0.113.35', '/api/v1/nope', 404],
  ])(
    'charges %s against the public API limit',
    async (_what, address, path, admitted) => {
      const server = await serverWith({ public_api: perMinute(2) });
      const call = () => server.request(address, path);
      try {
        expect((await call()).status).toBe(admitted);
        expect((await call()).status).toBe(admitted);
        await expectProblemJson429(await call());
      } finally {
        await server.dispose();
      }
    },
  );

  it.each([
    ['POST', '203.0.113.61'],
    ['PUT', '203.0.113.62'],
    ['PATCH', '203.0.113.63'],
    ['DELETE', '203.0.113.64'],
    ['OPTIONS', '203.0.113.65'],
    ['HEAD', '203.0.113.66'],
    ['PROPFIND', '203.0.113.67'],
  ])(
    'charges a %s the route does not take against the public API limit',
    async (method, address) => {
      const server = await serverWith({ public_api: perMinute(2) });
      const call = () => server.raw(address, '/api/v1/status', method);
      try {
        expect((await call()).status).toBe(404);
        expect((await call()).status).toBe(404);
        expect((await call()).status).toBe(429);
      } finally {
        await server.dispose();
      }
    },
  );

  it('charges every alias of a route to the one bucket', async () => {
    const server = await serverWith({ public_api: perMinute(3) });
    const call = (path: string) => server.raw('203.0.113.37', path);
    try {
      expect((await call('/API/v1//status')).status).toBe(200);
      expect((await call('//api/%76%31/status;x')).status).toBe(200);
      expect((await call('/api/v1/DOCS/')).status).toBe(200);
      expect((await call('/api/v1/status')).status).toBe(429);
    } finally {
      await server.dispose();
    }
  });

  it('charges the reference page against a limit of its own as well', async () => {
    const server = await serverWith({
      public_api: perMinute(10),
      api_docs: perMinute(2),
    });
    const call = (path: string) => server.request('203.0.113.38', path);
    try {
      expect((await call('/api/v1/docs')).status).toBe(200);
      expect((await call('/api/v1/docs')).status).toBe(200);
      await expectProblemJson429(await call('/api/v1/docs'));
      expect((await call('/api/v1/status')).status).toBe(200);
    } finally {
      await server.dispose();
    }
  });

  it('charges the reference page against the public API limit', async () => {
    const server = await serverWith({ public_api: perMinute(2) });
    const call = (path: string) => server.request('203.0.113.39', path);
    try {
      expect((await call('/api/v1/docs')).status).toBe(200);
      expect((await call('/api/v1/status')).status).toBe(200);
      await expectProblemJson429(await call('/api/v1/docs'));
    } finally {
      await server.dispose();
    }
  });

  it('refuses a third WebSocket upgrade for one user, from any address', async () => {
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
    const userId = `user-${randomUUID()}`;
    const client = await createProtocolBuilderClient(
      studioWith({ rpc_user: perMinute(2) }, userId),
    );
    const caller = {
      principal: {
        kind: 'user',
        userId,
        email: Redacted.make(`${userId}@example.org`),
        emailVerified: true,
        name: Redacted.make('Researcher'),
        locale: null,
        sessionId: `session-${userId}`,
      },
      connection: `${userId}-connection`,
      tab: `${userId}-tab`,
    } as const;
    const call = () =>
      client.callExit(
        caller,
        client.rpc('ListSections', {
          protocolId: ProtocolId.make(randomUUID()),
        }),
      );
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expectRpcFailure(call(), 'ProtocolNotFound');
      }
      expectBuilderRateLimited(await call());
    } finally {
      await client.dispose();
    }
  });

  it('refuses a third RPC call for one team, whoever makes it', async () => {
    const teamId = TeamId.make(`team-${randomUUID()}`);
    const client = await rpcClientFor(
      studioWith(
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
