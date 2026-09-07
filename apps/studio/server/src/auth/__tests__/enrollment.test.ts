import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeploymentMode } from '@codaco/studio-rpc/surfaces';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { readEnv } from '../../env.ts';
import { completeSetup } from '../../instance/bootstrap.ts';
import { operationalLogger } from '../../observability/logger.ts';
import { configuration, rootOne } from '../../pii/__tests__/fixtures.ts';
import { initializeEncryption } from '../../pii/initialize.ts';
import {
  createBetterAuthInstance,
  createBetterAuthService,
} from '../better-auth.ts';

const db = await reachableDb();
const env = readEnv();
const ownerEmail = 'owner@example.com';
const newEmail = 'invited@example.com';
const microsoftTenant = '11111111-2222-4333-8444-555555555555';
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'enrollment-test-key',
  alg: 'RS256',
  use: 'sig',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fixture(mode: DeploymentMode = 'self-hosted') {
  if (!db || !env.auth)
    throw new Error('Local Postgres and auth configuration required');
  const scratch = await createScratchSchema(db);
  await provisionScratchSchema(scratch.pool);
  const keys = await initializeEncryption({
    maintenancePool: scratch.maintenance,
    configuration: configuration(),
    loadRootKey: async () => rootOne,
  });
  const token = randomBytes(32).toString('base64url');
  await completeSetup(
    scratch.app,
    token,
    {
      token,
      instanceName: 'Research team',
      ownerName: 'Owner',
      ownerEmail,
      ownerPassword: 'test-only owner password',
    },
    randomUUID(),
  );
  const sent: { email: string; url: string }[] = [];
  const auth = createBetterAuthInstance(
    {
      ...env.auth,
      socialProviders: {
        google: {
          clientId: 'enrollment-test-client',
          clientSecret: 'enrollment-test-secret',
        },
        microsoft: {
          clientId: 'enrollment-test-client',
          clientSecret: 'enrollment-test-secret',
          tenantId: microsoftTenant,
        },
      },
    },
    scratch.app,
    {
      sendMagicLink: async (message) => {
        sent.push(message);
      },
    },
    { encryptionKeys: keys, deploymentMode: mode },
  );
  return { scratch, auth, sent, keys };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function invitation(
  { scratch }: Fixture,
  email = newEmail,
  state = 'pending',
  expired = false,
) {
  await scratch.pool.query(
    `INSERT INTO team_invitations (id, team_id, email, role, status, expires_at, inviter_id)
    SELECT $1, initial_team_id, $2, 'member', $3, $4, initial_owner_user_id FROM studio_instance`,
    [
      randomUUID(),
      email,
      state,
      new Date(Date.now() + (expired ? -60_000 : 3_600_000)),
    ],
  );
}

function request(
  auth: Pick<Fixture['auth'], 'handler'>,
  path: string,
  body: object,
  cookie?: string,
) {
  if (!env.auth) throw new Error('Missing auth fixture');
  return auth.handler(
    new Request(new URL(path, env.auth.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': env.auth.baseUrl,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function users({ scratch }: Fixture) {
  return (await scratch.pool.query('SELECT email FROM "user" ORDER BY email'))
    .rows;
}

async function verifyMagicLink(f: Fixture, email: string) {
  const response = await request(f.auth, '/api/auth/sign-in/magic-link', {
    email,
    callbackURL: '/sign-in',
    errorCallbackURL: '/sign-in',
  });
  expect(response.status).toBe(200);
  expect(f.sent.at(-1)?.email).toBe(email);
  const url = f.sent.at(-1)?.url;
  if (!url) throw new Error('Expected a real sent verification link');
  return f.auth.handler(new Request(url));
}

function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .find((cookie) => /(?:^|\.)session_token=[^;]/.test(cookie));
}

async function socialCallback(
  f: Fixture,
  provider: 'google' | 'microsoft',
  email: string,
  claims: Record<string, unknown>,
  linkCookie?: string,
) {
  const tokenUrl =
    provider === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : `https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/token`;
  const keysUrl =
    provider === 'google'
      ? 'https://www.googleapis.com/oauth2/v3/certs'
      : `https://login.microsoftonline.com/${microsoftTenant}/discovery/v2.0/keys`;
  let idToken = '';
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    if (url === tokenUrl)
      return Response.json({
        access_token: 'synthetic-enrollment-access',
        refresh_token: 'synthetic-enrollment-refresh',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600,
      });
    if (url === keysUrl) return Response.json({ keys: [jwk] });
    if (
      provider === 'microsoft' &&
      url === 'https://graph.microsoft.com/v1.0/me/photos/48x48/%24value'
    )
      return new Response(null, { status: 404 });
    throw new Error(`Unexpected OAuth transport: ${url}`);
  });
  const start = await request(
    f.auth,
    linkCookie ? '/api/auth/link-social' : '/api/auth/sign-in/social',
    {
      provider,
      callbackURL: '/sign-in',
      errorCallbackURL: '/sign-in',
    },
    linkCookie,
  );
  expect(start.status).toBe(200);
  const body = (await start.json()) as { url: string };
  const authorization = new URL(body.url);
  const state = authorization.searchParams.get('state');
  expect(state).toBeTruthy();
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({
    iss:
      provider === 'google'
        ? 'https://accounts.google.com'
        : `https://login.microsoftonline.com/${microsoftTenant}/v2.0`,
    ...(provider === 'microsoft'
      ? { tid: microsoftTenant, oid: randomUUID() }
      : {}),
    aud: 'enrollment-test-client',
    sub: randomUUID(),
    iat: now,
    exp: now + 300,
    email,
    ...claims,
    name: 'Invited Researcher',
    ...(authorization.searchParams.get('nonce')
      ? { nonce: authorization.searchParams.get('nonce') }
      : {}),
  })}`;
  idToken = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
  const callback = new URL(`/api/auth/callback/${provider}`, env.auth!.baseUrl);
  callback.searchParams.set('state', state!);
  callback.searchParams.set('code', 'synthetic-authorization-code');
  const response = await f.auth.handler(
    new Request(callback, {
      headers: {
        cookie: [
          linkCookie,
          ...start.headers.getSetCookie().map((cookie) => cookie.split(';')[0]),
        ]
          .filter(Boolean)
          .join('; '),
      },
    }),
  );
  expect(calls).toContain(tokenUrl);
  expect(response.status).toBe(302);
  return response;
}

function googleCallback(
  f: Fixture,
  email: string,
  verified: boolean | undefined,
) {
  return socialCallback(f, 'google', email, { email_verified: verified });
}

describe.skipIf(!db)(
  'self-hosted enrollment through actual Better Auth endpoints',
  () => {
    it('disables public password signup even for an invited address and ignores forged verified flags', async () => {
      const f = await fixture();
      try {
        await invitation(f);
        const response = await request(f.auth, '/api/auth/sign-up/email', {
          email: newEmail,
          name: 'Visitor',
          password: 'visitor test password',
          emailVerified: true,
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
        });
        expect(sessionCookie(response)).toBeUndefined();
        expect(await users(f)).toEqual([{ email: ownerEmail }]);
      } finally {
        await f.scratch.dispose();
      }
    });

    it.each(['missing', 'expired', 'cancelled', 'accepted'])(
      'refuses magic-link creation for a %s invitation',
      async (state) => {
        const f = await fixture();
        try {
          if (state !== 'missing')
            await invitation(
              f,
              newEmail,
              state === 'expired' ? 'pending' : state,
              state === 'expired',
            );
          const verified = await verifyMagicLink(f, newEmail);
          expect(
            new URL(
              verified.headers.get('location')!,
              env.auth!.baseUrl,
            ).searchParams.get('error'),
          ).toBe('INVITATION_REQUIRED');
          expect(sessionCookie(verified)).toBeUndefined();
          expect(await users(f)).toEqual([{ email: ownerEmail }]);
        } finally {
          await f.scratch.dispose();
        }
      },
    );

    it('allows verified invited magic-link creation and existing owner login without another invitation', async () => {
      const f = await fixture();
      try {
        await invitation(f, newEmail.toUpperCase());
        expect(sessionCookie(await verifyMagicLink(f, newEmail))).toBeDefined();
        expect(await users(f)).toEqual([
          { email: newEmail },
          { email: ownerEmail },
        ]);
        expect(
          sessionCookie(await verifyMagicLink(f, ownerEmail)),
        ).toBeDefined();
        // Enrollment never silently joins a team; acceptance still owns that write.
        expect(
          (
            await f.scratch.pool.query(
              'SELECT count(*)::int AS count FROM team_members',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
      } finally {
        await f.scratch.dispose();
      }
    });

    it.each([
      { verified: true, state: 'missing' },
      { verified: false, state: 'pending' },
      { verified: undefined, state: 'pending' },
      { verified: true, state: 'expired' },
      { verified: true, state: 'cancelled' },
    ])(
      'refuses OAuth creation for verified=$verified and invitation=$state',
      async ({ verified, state }) => {
        const f = await fixture();
        try {
          if (state !== 'missing')
            await invitation(
              f,
              newEmail,
              state === 'expired' ? 'pending' : state,
              state === 'expired',
            );
          const response = await googleCallback(f, newEmail, verified);
          expect(
            new URL(
              response.headers.get('location')!,
              env.auth!.baseUrl,
            ).searchParams.get('error'),
          ).toBeTruthy();
          expect(sessionCookie(response)).toBeUndefined();
          expect(await users(f)).toEqual([{ email: ownerEmail }]);
          expect(
            (
              await f.scratch.pool.query(
                `SELECT id FROM account WHERE "providerId" = 'google'`,
              )
            ).rows,
          ).toEqual([]);
        } finally {
          await f.scratch.dispose();
        }
      },
    );

    it('allows an invited provider-verified OAuth identity and persists its credentials encrypted', async () => {
      const f = await fixture();
      try {
        await invitation(f);
        const response = await googleCallback(f, newEmail, true);
        expect(
          new URL(
            response.headers.get('location')!,
            env.auth!.baseUrl,
          ).searchParams.get('error'),
        ).toBeNull();
        expect(sessionCookie(response)).toBeDefined();
        expect(await users(f)).toEqual([
          { email: newEmail },
          { email: ownerEmail },
        ]);
        const stored = (
          await f.scratch.pool.query(
            `SELECT "accessToken", "refreshToken", "idToken", access_token_ciphertext FROM account WHERE "providerId" = 'google'`,
          )
        ).rows;
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({
          accessToken: null,
          refreshToken: null,
          idToken: null,
        });
        expect(Buffer.isBuffer(stored[0]?.access_token_ciphertext)).toBe(true);
      } finally {
        await f.scratch.dispose();
      }
    });

    it.each([false, undefined])(
      'refuses unverified OAuth linking to an existing owner (claim=%s)',
      async (verified) => {
        const f = await fixture();
        try {
          const response = await googleCallback(f, ownerEmail, verified);
          expect(
            new URL(
              response.headers.get('location')!,
              env.auth!.baseUrl,
            ).searchParams.get('error'),
          ).toBeTruthy();
          expect(sessionCookie(response)).toBeUndefined();
          expect(
            (
              await f.scratch.pool.query(
                `SELECT id FROM account WHERE "providerId" = 'google'`,
              )
            ).rows,
          ).toEqual([]);
          expect(await users(f)).toEqual([{ email: ownerEmail }]);
        } finally {
          await f.scratch.dispose();
        }
      },
    );

    it.each([
      {
        name: 'email_verified',
        claims: { email_verified: true },
        accepted: true,
      },
      {
        name: 'verified_primary_email',
        claims: { verified_primary_email: [newEmail] },
        accepted: true,
      },
      {
        name: 'verified_secondary_email',
        claims: { verified_secondary_email: [newEmail] },
        accepted: true,
      },
      { name: 'ordinary mutable email', claims: {}, accepted: false },
      {
        name: 'different verified mailbox',
        claims: { verified_primary_email: ['someone-else@example.com'] },
        accepted: false,
      },
      {
        name: 'explicit false overrides verified list',
        claims: { email_verified: false, verified_primary_email: [newEmail] },
        accepted: false,
      },
      {
        name: 'domain ownership only',
        claims: { xms_edov: true },
        accepted: false,
      },
    ])(
      'uses native Microsoft $name evidence for invited enrollment',
      async ({ claims, accepted }) => {
        const f = await fixture();
        try {
          await invitation(f);
          const response = await socialCallback(
            f,
            'microsoft',
            newEmail,
            claims,
          );
          const error = new URL(
            response.headers.get('location')!,
            env.auth!.baseUrl,
          ).searchParams.get('error');
          expect(error).toBe(accepted ? null : 'INVITATION_REQUIRED');
          expect(Boolean(sessionCookie(response))).toBe(accepted);
          expect(await users(f)).toEqual(
            accepted
              ? [{ email: newEmail }, { email: ownerEmail }]
              : [{ email: ownerEmail }],
          );
          const accounts = (
            await f.scratch.pool.query(
              `SELECT "accessToken", "refreshToken", "idToken", access_token_ciphertext FROM account WHERE "providerId" = 'microsoft'`,
            )
          ).rows;
          expect(accounts).toHaveLength(accepted ? 1 : 0);
          if (accepted) {
            expect(accounts[0]).toMatchObject({
              accessToken: null,
              refreshToken: null,
              idToken: null,
            });
            expect(Buffer.isBuffer(accounts[0]?.access_token_ciphertext)).toBe(
              true,
            );
          }
        } finally {
          await f.scratch.dispose();
        }
      },
    );

    it.each(['implicit', 'authenticated explicit'])(
      'keeps a verified local mailbox safe from Microsoft %s linking without provider mailbox evidence',
      async (linkMode) => {
        const f = await fixture();
        try {
          await invitation(f);
          const proof = await verifyMagicLink(f, newEmail);
          const cookie = sessionCookie(proof)?.split(';')[0];
          expect(cookie).toBeTruthy();
          const response = await socialCallback(
            f,
            'microsoft',
            newEmail,
            {},
            linkMode === 'authenticated explicit' ? cookie : undefined,
          );
          expect(
            new URL(
              response.headers.get('location')!,
              env.auth!.baseUrl,
            ).searchParams.get('error'),
          ).toBeTruthy();
          expect(sessionCookie(response)).toBeUndefined();
          expect(
            (
              await f.scratch.pool.query(
                `SELECT id FROM account WHERE "providerId" = 'microsoft'`,
              )
            ).rows,
          ).toEqual([]);
          expect(await users(f)).toEqual([
            { email: newEmail },
            { email: ownerEmail },
          ]);
          // Mailbox-proof authentication remains usable after the refused link.
          expect(
            (
              await f.auth.api.getSession({
                headers: new Headers({ cookie: cookie! }),
              })
            )?.user.email,
          ).toBe(newEmail);
        } finally {
          await f.scratch.dispose();
        }
      },
    );

    it('contains an actual Better Auth transport failure before framework logging or response exposure', async () => {
      const f = await fixture();
      try {
        const raw = vi
          .spyOn(console, 'error')
          .mockImplementation(() => undefined);
        const diagnostic = vi
          .spyOn(operationalLogger, 'diagnostic')
          .mockImplementation(() => undefined);
        const canary = 'private-researcher@example.test-provider-token-canary';
        const failing = createBetterAuthService(
          env.auth!,
          f.scratch.app,
          {
            sendMagicLink: async () => {
              throw new Error(canary);
            },
          },
          { deploymentMode: 'self-hosted', encryptionKeys: f.keys },
        );
        const response = await request(
          failing,
          '/api/auth/sign-in/magic-link',
          { email: newEmail, callbackURL: '/sign-in' },
        );
        expect(raw).not.toHaveBeenCalled();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
          code: 'STUDIO_AUTH_UNAVAILABLE',
        });
        expect(diagnostic).toHaveBeenCalledWith('STUDIO_AUTH_ERROR', undefined);
        expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(canary);
        expect(await users(f)).toEqual([{ email: ownerEmail }]);
      } finally {
        await f.scratch.dispose();
      }
    });

    it('preserves managed public password enrollment', async () => {
      const f = await fixture('managed');
      try {
        const response = await request(f.auth, '/api/auth/sign-up/email', {
          email: newEmail,
          name: 'Visitor',
          password: 'visitor test password',
        });
        expect(response.status).toBe(200);
        expect(sessionCookie(response)).toBeDefined();
        expect(await users(f)).toEqual([
          { email: newEmail },
          { email: ownerEmail },
        ]);
      } finally {
        await f.scratch.dispose();
      }
    });
  },
);
