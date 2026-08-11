import { describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import type { AuthService } from '../auth/index.ts';
import { readEnv } from '../env.ts';

// The cookie plane's cross-origin refusal (#1248), unit-tested through the
// app with a fake auth service behind the seam — no database involved.

function fakeAuthService(): AuthService {
  return {
    handler: () => Promise.resolve(Response.json({})),
    getSession: () => Promise.resolve(null),
  };
}

function appWithFakeAuth() {
  return createApp(readEnv(), { auth: fakeAuthService() });
}

describe('cookie-plane CSRF', () => {
  it('refuses cross-origin unsafe methods on /rpc', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/rpc/status', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('refuses unsafe methods that assert a cross-site fetch', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/rpc/status', {
      method: 'POST',
      headers: {
        'sec-fetch-site': 'cross-site',
        // Sec-Fetch-Site wins even when Origin looks right: a browser that
        // says cross-site is cross-site.
        'origin': 'http://localhost:5173',
      },
    });
    expect(res.status).toBe(403);
  });

  it('refuses unsafe methods carrying no origin evidence at all', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/rpc/status', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('passes same-origin unsafe methods through', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/rpc/status', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(res.status).not.toBe(403);
  });

  it('passes unsafe methods with a matching Origin header', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/rpc/status', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.status).not.toBe(403);
  });

  it('leaves safe methods alone', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
  });

  it('refuses a WebSocket upgrade without our Origin', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/ws', {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated WebSocket upgrade from our Origin', async () => {
    const app = appWithFakeAuth();
    const res = await app.request('/ws', {
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.status).toBe(401);
  });
});
