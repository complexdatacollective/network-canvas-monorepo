import { afterEach, describe, expect, it, vi } from 'vitest';

// The Netlify lane's invariant — no database, auth off — is set by variables
// on the Netlify site, which live outside this repository and cannot be
// reviewed here. These tests pin the entrypoint's own behaviour under the
// misconfiguration that has actually happened: a site-level DATABASE_URL that
// the function cannot use, which turned every /api/auth/* call into a 500 and
// left the client showing its "server could not be reached" screen.
//
// The address is an unroutable loopback port: if the entrypoint ever does open
// a pool again, these fail fast rather than dialling a real host.
const SITE_ENV = {
  DATABASE_URL: 'postgres://studio:studio@127.0.0.1:59999/studio',
  BETTER_AUTH_SECRET: 'a'.repeat(40),
  PUBLIC_URL: 'https://networkcanvas-studio.netlify.app',
};

// A deploy preview's origin is per-PR, so it never matches PUBLIC_URL. This is
// the origin the browser actually uses against a preview.
const PREVIEW_ORIGIN =
  'https://deploy-preview-1554--networkcanvas-studio.netlify.app';

/**
 * Every way a site can define the database and authentication settings badly.
 * The lane never serves either surface, so none of these should reach it at
 * all — but each one used to be fatal, and fatal here is not a degraded
 * response: the throw happens while the module initializes, so the function
 * exports no handler and answers nothing, /healthz included.
 */
const SITE_MISCONFIGURATIONS: ReadonlyArray<
  readonly [string, Readonly<Record<string, string | undefined>>]
> = [
  ['a database with no signing secret', { BETTER_AUTH_SECRET: undefined }],
  ['a database with no public URL', { PUBLIC_URL: undefined }],
  // Refused even with no database at all, so that a deployment meaning to
  // serve auth cannot half-configure a provider — a rule this lane has to
  // sidestep without weakening it anywhere else.
  [
    'half a social provider',
    { DATABASE_URL: undefined, GOOGLE_CLIENT_ID: 'google-id-with-no-secret' },
  ],
  // Rejected by the schema parse, before resolution: a result to blank never
  // exists.
  [
    'a public URL that is not a URL',
    { PUBLIC_URL: 'networkcanvas-studio.netlify.app' },
  ],
  ['a signing secret under the length floor', { BETTER_AUTH_SECRET: 'short' }],
];

async function loadHandler(
  env: Readonly<Record<string, string | undefined>> = SITE_ENV,
) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { default: handler } = await import('../netlify.ts');
  return handler;
}

describe('the Netlify function entrypoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses auth as unconfigured rather than erroring, even when the site defines a database', async () => {
    const handler = await loadHandler();

    const res = await handler(
      new Request(`${PREVIEW_ORIGIN}/api/auth/get-session`),
    );

    // 503 is the supported degradation the client reads as "reachable server,
    // nobody signed in"; a 500 is what sends it to the error screen instead.
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      title: 'Authentication Not Configured',
      status: 503,
    });
  });

  it('does not mount a CSRF gate against an origin a preview cannot match', async () => {
    const handler = await loadHandler();

    const res = await handler(
      new Request(`${PREVIEW_ORIGIN}/rpc/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': PREVIEW_ORIGIN,
        },
        body: '{}',
      }),
    );

    expect(res.status).not.toBe(403);
  });

  it('still reports healthy', async () => {
    const handler = await loadHandler();

    const res = await handler(new Request(`${PREVIEW_ORIGIN}/healthz`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  for (const [label, overrides] of SITE_MISCONFIGURATIONS) {
    it(`serves the same degradation when the site defines ${label}`, async () => {
      const handler = await loadHandler({ ...SITE_ENV, ...overrides });

      const health = await handler(new Request(`${PREVIEW_ORIGIN}/healthz`));
      expect(health.status).toBe(200);

      const session = await handler(
        new Request(`${PREVIEW_ORIGIN}/api/auth/get-session`),
      );
      expect(session.status).toBe(503);
      expect(await session.json()).toEqual({
        title: 'Authentication Not Configured',
        status: 503,
      });
    });
  }
});
