import { describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';

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
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toContain('/status');
  });

  it('does not serve unknown API paths', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/nope');
    expect(res.status).toBe(404);
  });
});
