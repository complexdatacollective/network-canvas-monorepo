import { describe, expect, it } from 'vitest';

import { createApp, createStudio } from '../app.ts';
import { readEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import { composeStudio, startStudioServer } from './support/serve.ts';

function appWithFakeAuth() {
  return createApp(readEnv(), { auth: stubAuthService() });
}

/**
 * The whole stack on a real port. The upgrade guards answer through the
 * Effect shell's bridge now, so the two `/ws` cases below need the composed
 * server rather than an in-process Hono request.
 */
function serverWithFakeAuth() {
  const env = readEnv();
  return startStudioServer(env, createStudio(env, { auth: stubAuthService() }));
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
    // Through the composed stack, because liveness is an Effect route now.
    const env = readEnv();
    const stack = composeStudio(
      env,
      createStudio(env, { auth: stubAuthService() }),
    );
    try {
      const res = await stack.request('/healthz');
      expect(res.status).toBe(200);
    } finally {
      await stack.dispose();
    }
  });

  it('refuses a WebSocket upgrade without our Origin', async () => {
    const { origin, dispose } = await serverWithFakeAuth();
    try {
      const res = await fetch(`${origin}/ws`, {
        headers: { origin: 'https://evil.example' },
      });
      expect(res.status).toBe(403);
    } finally {
      await dispose();
    }
  });

  it('refuses an unauthenticated WebSocket upgrade from our Origin', async () => {
    const { origin, dispose } = await serverWithFakeAuth();
    try {
      const res = await fetch(`${origin}/ws`, {
        headers: { origin: 'http://localhost:5173' },
      });
      expect(res.status).toBe(401);
    } finally {
      await dispose();
    }
  });
});
