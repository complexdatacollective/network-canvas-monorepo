import { randomUUID } from 'node:crypto';

import { escapeIdentifier } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRegistryAuth, type RegistryAuth } from '../service.ts';
import {
  createAuthFixture,
  REGISTRY_ORIGIN,
  type AuthFixture,
} from './fixtures.ts';

function post(
  auth: RegistryAuth,
  path: string,
  body: object,
  headers?: ConstructorParameters<typeof Headers>[0],
) {
  return auth.handler(
    new Request(`${REGISTRY_ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'origin': REGISTRY_ORIGIN,
        ...Object.fromEntries(new Headers(headers)),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function send(fixture: AuthFixture, email = 'reader@example.test') {
  const before = fixture.sent.length;
  const response = await post(fixture.auth, '/sign-in/magic-link', {
    email,
    callbackURL: '/account',
  });
  expect(response.status).toBe(200);
  expect(fixture.sent).toHaveLength(before + 1);
  const message = fixture.sent[before];
  if (!message) throw new Error('magic-link message missing');
  expect(message.email).toBe(email);
  return message.url;
}

function sessionHeaders(response: Response): Headers {
  const cookies = response.headers.getSetCookie();
  expect(
    cookies.some((cookie) =>
      cookie.startsWith('__Secure-registry.session_token='),
    ),
  ).toBe(true);
  return new Headers({
    cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
  });
}

describe('registry magic-link authentication on PostgreSQL', () => {
  let fixture: AuthFixture;

  beforeEach(async () => {
    fixture = await createAuthFixture();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fixture?.dispose();
  });

  it('signs in through the real endpoints and sets a registry-only secure session cookie', async () => {
    const link = await send(fixture);
    const token = new URL(link).searchParams.get('token');
    expect(token).toBeTruthy();
    const stored = await fixture.owner.query<{ identifier: string }>(
      'SELECT identifier FROM registry_auth_verification',
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.identifier).not.toBe(token);

    const response = await fixture.auth.handler(new Request(link));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${REGISTRY_ORIGIN}/account`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('Secure');
    expect(cookies).toContain('SameSite=Lax');
    expect(cookies).not.toContain('Domain=');
    const headers = sessionHeaders(response);
    const session = await fixture.auth.getSession(headers);
    expect(session).toEqual({
      userId: expect.any(String),
      email: 'reader@example.test',
      emailVerified: true,
    });
    expect(await fixture.auth.getSession(new Headers())).toBeNull();

    const endpoint = await fixture.auth.handler(
      new Request(`${REGISTRY_ORIGIN}/api/auth/get-session`, { headers }),
    );
    expect(endpoint.status).toBe(200);
    expect(await endpoint.json()).toMatchObject({
      user: { id: session!.userId, emailVerified: true },
    });
    expect(
      (await fixture.pool.query('SELECT current_user AS role')).rows,
    ).toEqual([{ role: fixture.role }]);
  });

  it('atomically consumes a link once across independent auth instances', async () => {
    const link = await send(fixture);
    const other = fixture.createAuth();
    const responses = await Promise.all([
      fixture.auth.handler(new Request(link)),
      other.handler(new Request(link)),
    ]);
    const targets = responses.map(
      (response) => new URL(response.headers.get('location')!),
    );
    expect(
      targets.filter(
        (url) => url.searchParams.get('error') === 'INVALID_TOKEN',
      ),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.headers.has('set-cookie')),
    ).toHaveLength(1);
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_auth_session',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_auth_verification',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it('refuses an expired token without creating a user or session', async () => {
    const link = await send(fixture);
    const expired = await fixture.owner.query(
      "UPDATE registry_auth_verification SET expires_at = now() - interval '1 second'",
    );
    expect(expired.rowCount).toBe(1);
    const response = await fixture.auth.handler(new Request(link));
    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.get('location')!).searchParams.get('error'),
    ).toBe('INVALID_TOKEN');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_auth_user',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_auth_session',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it('promotes an existing unverified email and revokes sessions that predate proof', async () => {
    const userId = randomUUID();
    await fixture.owner.query(
      'INSERT INTO registry_auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, false)',
      [userId, 'Unverified account', 'reader@example.test'],
    );
    await fixture.owner.query(
      "INSERT INTO registry_auth_session (id, user_id, token, expires_at, updated_at) VALUES ($1, $2, $3, now() + interval '1 day', now())",
      ['old-session', userId, randomUUID()],
    );
    const link = await send(fixture);
    const response = await fixture.auth.handler(new Request(link));
    expect(response.status).toBe(302);
    expect(await fixture.auth.getSession(sessionHeaders(response))).toEqual({
      userId,
      email: 'reader@example.test',
      emailVerified: true,
    });
    expect(
      (
        await fixture.owner.query(
          "SELECT id FROM registry_auth_session WHERE id = 'old-session'",
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_auth_session',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (await fixture.owner.query('SELECT id FROM registry_auth_account')).rows,
    ).toEqual([]);
  });

  it('cannot store password or OAuth accounts even through the application database role', async () => {
    const userId = randomUUID();
    await fixture.owner.query(
      'INSERT INTO registry_auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, true)',
      [userId, 'Reader', 'reader@example.test'],
    );
    await expect(
      fixture.pool.query(
        'INSERT INTO registry_auth_account (id, user_id) VALUES ($1, $2)',
        [randomUUID(), userId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'registry_auth_account_disabled',
    });
    expect(
      (
        await fixture.owner.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registry_auth_account' ORDER BY column_name",
        )
      ).rows,
    ).toEqual([{ column_name: 'id' }, { column_name: 'user_id' }]);
  });

  it.each(['https://foreign.test', 'null'])(
    'refuses a foreign sign-in Origin %s before sending mail',
    async (origin) => {
      const response = await post(
        fixture.auth,
        '/sign-in/magic-link',
        { email: 'reader@example.test' },
        { origin },
      );
      expect(response.status).toBe(403);
      expect(fixture.sent).toHaveLength(0);
      expect(
        (await fixture.owner.query('SELECT id FROM registry_auth_verification'))
          .rows,
      ).toEqual([]);
    },
  );

  it('requires an Origin for sign-in even without an existing cookie', async () => {
    const response = await fixture.auth.handler(
      new Request(`${REGISTRY_ORIGIN}/api/auth/sign-in/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reader@example.test' }),
      }),
    );
    expect(response.status).toBe(403);
    expect(fixture.sent).toHaveLength(0);
  });

  it.each(['callbackURL', 'newUserCallbackURL', 'errorCallbackURL'])(
    'refuses a foreign %s on sign-in',
    async (field) => {
      const response = await post(fixture.auth, '/sign-in/magic-link', {
        email: 'reader@example.test',
        [field]: 'https://foreign.test/private-callback',
      });
      expect(response.status).toBe(403);
      expect(fixture.sent).toHaveLength(0);
      expect(
        (await fixture.owner.query('SELECT id FROM registry_auth_verification'))
          .rows,
      ).toEqual([]);
    },
  );

  it.each(['callbackURL', 'newUserCallbackURL', 'errorCallbackURL'])(
    'refuses a tampered verification %s before consuming its token',
    async (field) => {
      const link = await send(fixture);
      const altered = new URL(link);
      altered.searchParams.set(field, 'https://foreign.test/private-callback');
      const response = await fixture.auth.handler(new Request(altered));
      expect(response.status).toBe(403);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(
        (
          await fixture.owner.query(
            'SELECT count(*)::int AS count FROM registry_auth_verification',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      const valid = await fixture.auth.handler(new Request(link));
      expect(valid.status).toBe(302);
      expect(
        await fixture.auth.getSession(sessionHeaders(valid)),
      ).toMatchObject({ emailVerified: true });
    },
  );

  it.each([
    '//foreign.test/path',
    'https://registry.test.foreign.test/',
    'javascript:alert(1)',
    '/\\foreign.test',
  ])('refuses the foreign callback form %s', async (callbackURL) => {
    const response = await post(fixture.auth, '/sign-in/magic-link', {
      email: 'reader@example.test',
      callbackURL,
    });
    expect(response.status).toBe(403);
    expect(fixture.sent).toHaveLength(0);
  });

  it.each([
    '/sign-in/email',
    '/sign-up/email',
    '/sign-in/social',
    '/callback/google',
    '/request-password-reset',
    '/reset-password',
    '/change-password',
    '/set-password',
    '/link-social',
    '/organization/create',
    '/change-email',
    '/update-user',
  ])('does not expose %s', async (path) => {
    const response = await post(fixture.auth, path, {
      email: 'reader@example.test',
      password: 'not-enabled',
      provider: 'google',
    });
    expect(response.status).toBe(404);
    expect(fixture.sent).toHaveLength(0);
    expect(
      (await fixture.owner.query('SELECT id FROM registry_auth_user')).rows,
    ).toEqual([]);
  });

  it('persists framework rate counters across auth instances and ignores forged forwarding headers', async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await post(
        fixture.auth,
        '/sign-in/magic-link',
        { email: `reader-${index}@example.test` },
        {
          'x-forwarded-for': `203.0.113.${index + 1}`,
          'x-real-ip': `203.0.113.${index + 1}`,
        },
      );
      expect(response.status).toBe(200);
    }
    expect(fixture.sent).toHaveLength(5);
    const other = fixture.createAuth();
    const blocked = await post(
      other,
      '/sign-in/magic-link',
      { email: 'another@example.test' },
      { 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.1' },
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(fixture.sent).toHaveLength(5);
    expect(
      (await fixture.owner.query('SELECT count FROM registry_auth_rate_limit'))
        .rows,
    ).toEqual([{ count: 5 }]);
  });

  it('rejects foreign session access and sign-out, then revokes the same-origin session', async () => {
    const link = await send(fixture);
    const verified = await fixture.auth.handler(new Request(link));
    const headers = sessionHeaders(verified);
    const cookie = headers.get('cookie')!;
    headers.set('origin', 'https://foreign.test');
    expect(await fixture.auth.getSession(headers)).toBeNull();
    const rejected = await fixture.auth.handler(
      new Request(`${REGISTRY_ORIGIN}/api/auth/get-session`, { headers }),
    );
    expect(rejected.status).toBe(403);
    expect(
      (
        await post(
          fixture.auth,
          '/sign-out',
          {},
          { cookie, origin: 'https://foreign.test' },
        )
      ).status,
    ).toBe(403);
    expect(
      await fixture.auth.getSession(new Headers({ cookie })),
    ).toMatchObject({ emailVerified: true });
    const signedOut = await post(fixture.auth, '/sign-out', {}, { cookie });
    expect(signedOut.status).toBe(200);
    expect(await fixture.auth.getSession(new Headers({ cookie }))).toBeNull();
  });

  it('does not accept a forged cookie or a Studio cookie name', async () => {
    const link = await send(fixture);
    const verified = await fixture.auth.handler(new Request(link));
    const headers = sessionHeaders(verified);
    const studioCookie = headers
      .get('cookie')!
      .replaceAll('__Secure-registry.', '__Secure-better-auth.');
    expect(
      await fixture.auth.getSession(new Headers({ cookie: studioCookie })),
    ).toBeNull();
    expect(
      await fixture.auth.getSession(
        new Headers({ cookie: '__Secure-registry.session_token=forged' }),
      ),
    ).toBeNull();
    expect(await fixture.auth.getSession(headers)).toMatchObject({
      emailVerified: true,
    });
  });

  it('reloads email verification and session expiry from PostgreSQL', async () => {
    const link = await send(fixture);
    const verified = await fixture.auth.handler(new Request(link));
    const headers = sessionHeaders(verified);
    const session = await fixture.auth.getSession(headers);
    expect(session).toMatchObject({ emailVerified: true });
    await fixture.owner.query(
      'UPDATE registry_auth_user SET email_verified = false WHERE id = $1',
      [session!.userId],
    );
    expect(await fixture.auth.getSession(headers)).toMatchObject({
      emailVerified: false,
    });
    await fixture.owner.query(
      "UPDATE registry_auth_session SET expires_at = now() - interval '1 second'",
    );
    expect(await fixture.auth.getSession(headers)).toBeNull();
  });

  it('redacts mail exceptions from responses, diagnostic callbacks and console output', async () => {
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const warnLog = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const infoLog = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const auth = fixture.createAuth({
      sendMagicLink: async ({ email, url }) => {
        throw new Error(`private-mail-error ${email} ${url}`);
      },
    });
    const response = await post(auth, '/sign-in/magic-link', {
      email: 'private-mail-canary@example.test',
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'REGISTRY_AUTH_UNAVAILABLE',
    });
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
    expect(infoLog).not.toHaveBeenCalled();
    expect(fixture.diagnostics).toContain('REGISTRY_AUTH_REQUEST_FAILURE');
    expect(new Set(fixture.diagnostics)).toEqual(
      new Set(['REGISTRY_AUTH_REQUEST_FAILURE']),
    );
  });

  it('redacts real PostgreSQL auth failures and fails session reads closed', async () => {
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const warnLog = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const infoLog = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const link = await send(fixture);
    const verified = await fixture.auth.handler(new Request(link));
    const headers = sessionHeaders(verified);
    expect(await fixture.auth.getSession(headers)).toMatchObject({
      emailVerified: true,
    });
    await fixture.owner.query(
      `REVOKE SELECT ON registry_auth_session FROM ${escapeIdentifier(fixture.role)}`,
    );
    await expect(fixture.auth.getSession(headers)).rejects.toThrow(
      'REGISTRY_AUTH_SESSION_UNAVAILABLE',
    );
    expect(fixture.diagnostics).toContain('REGISTRY_AUTH_SESSION_FAILURE');
    await fixture.owner.query(
      `REVOKE INSERT ON registry_auth_verification FROM ${escapeIdentifier(fixture.role)}`,
    );
    const response = await post(fixture.auth, '/sign-in/magic-link', {
      email: 'private-database-canary@example.test',
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'REGISTRY_AUTH_UNAVAILABLE',
    });
    expect(fixture.sent).toHaveLength(1);
    expect(new Set(fixture.diagnostics)).toEqual(
      new Set([
        'REGISTRY_AUTH_DIAGNOSTIC',
        'REGISTRY_AUTH_SESSION_FAILURE',
        'REGISTRY_AUTH_REQUEST_FAILURE',
      ]),
    );
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
    expect(infoLog).not.toHaveBeenCalled();
  });

  it('rejects unsafe configuration with a fixed diagnostic error', () => {
    expect(() =>
      createRegistryAuth({ ...fixture.options, secret: 'short-secret-canary' }),
    ).toThrow('REGISTRY_AUTH_INVALID_CONFIGURATION');
    expect(() =>
      createRegistryAuth({
        ...fixture.options,
        baseUrl: 'https://private-user:private-password@registry.test',
      }),
    ).toThrow('REGISTRY_AUTH_INVALID_CONFIGURATION');
  });
});
