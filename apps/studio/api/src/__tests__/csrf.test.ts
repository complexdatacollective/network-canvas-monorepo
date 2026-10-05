import { describe, expect, it } from 'vitest';

import { RPC_PATH } from '@codaco/studio-contract/rpc/studio';

import { createStudio } from '../app.ts';
import { readEnv } from '../env.ts';
import { authServiceStub } from './support/auth.ts';
import { composeStudio, startStudioServer } from './support/serve.ts';

async function postRpc(headers: Record<string, string> = {}) {
  const env = readEnv();
  const stack = composeStudio(
    env,
    createStudio(env, { auth: authServiceStub() }),
  );
  try {
    return await stack.request(RPC_PATH, { method: 'POST', headers });
  } finally {
    await stack.dispose();
  }
}

function serverWithFakeAuth() {
  const env = readEnv();
  return startStudioServer(env, createStudio(env, { auth: authServiceStub() }));
}

describe('cookie-plane CSRF', () => {
  it('refuses cross-origin unsafe methods on /rpc', async () => {
    const res = await postRpc({ origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('refuses unsafe methods that assert a cross-site fetch', async () => {
    const res = await postRpc({
      'sec-fetch-site': 'cross-site',
      'origin': 'http://localhost:5173',
    });
    expect(res.status).toBe(403);
  });

  it('refuses unsafe methods carrying no origin evidence at all', async () => {
    const res = await postRpc();
    expect(res.status).toBe(403);
  });

  it('passes same-origin unsafe methods through', async () => {
    const res = await postRpc({ 'sec-fetch-site': 'same-origin' });
    expect(res.status).not.toBe(403);
  });

  it('passes unsafe methods with a matching Origin header', async () => {
    const res = await postRpc({ origin: 'http://localhost:5173' });
    expect(res.status).not.toBe(403);
  });

  it('leaves safe methods alone', async () => {
    const env = readEnv();
    const stack = composeStudio(
      env,
      createStudio(env, { auth: authServiceStub() }),
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
