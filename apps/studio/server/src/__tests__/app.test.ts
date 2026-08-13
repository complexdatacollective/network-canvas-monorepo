import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { describe, expect, it } from 'vitest';

import type { contract } from '@codaco/studio-rpc';

import { createApp } from '../app.ts';

// The contract-typed client the SPA uses, bridged straight into the Hono app.
function createRpcClient(app: ReturnType<typeof createApp>) {
  const link = new RPCLink({
    origin: 'http://studio.test',
    url: '/rpc',
    fetch: async (url, init) => app.request(url, init),
  });
  return createORPCClient(link) as RouterContractClient<typeof contract>;
}

describe('studio server', () => {
  it('reports healthy on /healthz', async () => {
    const app = createApp();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('serves instance status from the versioned API', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; version: string };
    expect(body.name).toBe('Network Canvas Studio');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('publishes an OpenAPI 3.1 document describing the API', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      servers: { url: string }[];
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi).toMatch(/^3\.1\./);
    // Paths are relative to the mount prefix; the document must say so, or
    // generated clients resolve /status against the host root.
    expect(doc.servers).toEqual([{ url: '/api/v1' }]);
    expect(Object.keys(doc.paths)).toContain('/status');
    expect(Object.keys(doc.components.schemas)).toContain('Status');
  });

  it('does not serve unknown API paths, refusing as problem JSON', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/nope');
    expect(res.status).toBe(404);
    // The guarantee is RFC 9457 problem details — never a fall-through to
    // the SPA fallback's HTML.
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
    expect(await res.json()).toEqual({ title: 'Not Found', status: 404 });
  });

  it('serves instance status over the typed RPC surface', async () => {
    const client = createRpcClient(createApp());
    const status = await client.status();
    expect(status.name).toBe('Network Canvas Studio');
    expect(status.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('does not serve unknown RPC paths', async () => {
    const app = createApp();
    const res = await app.request('/rpc/nope', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('does not serve unmatched storage paths', async () => {
    const app = createApp();
    // An asset caller must never be handed the SPA shell with a 200 to
    // cache: unmatched storage paths belong to the machine surface.
    for (const path of ['/storage/', '/storage/deadbeef/extra']) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
    }
  });
});
