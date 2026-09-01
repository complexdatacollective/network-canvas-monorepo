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

async function loadHandler() {
  for (const [key, value] of Object.entries(SITE_ENV)) vi.stubEnv(key, value);
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
});
