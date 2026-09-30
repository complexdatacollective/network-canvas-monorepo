import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.ts';
import { BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS } from '../audit/better-auth-policy.ts';
import { stubAuthService } from './support/auth.ts';
import { createRpcClient } from './support/rpc.ts';

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
    // The public surface's output schema is the serialization allowlist
    // (#1248): the SPA-facing auth capability and deployment blocks must
    // never leak here.
    expect(body).not.toHaveProperty('auth');
    expect(body).not.toHaveProperty('deployment');
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
    const res = await app.request('/rpc/nope', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('refuses audited team writes before Better Auth can mutate them', async () => {
    const handler = vi.fn(() =>
      Promise.resolve(Response.json({ wrote: true })),
    );
    const app = createApp(undefined, {
      auth: stubAuthService({ handler }),
    });
    const bodies: Record<string, object> = {
      '/api/auth/organization/create': {
        name: 'Unaudited Team',
        slug: 'unaudited-team',
      },
      '/api/auth/organization/update': {
        organizationId: 'team-a',
        data: { name: 'Unaudited Team' },
      },
      '/api/auth/organization/delete': {
        organizationId: 'team-a',
      },
      '/api/auth/organization/update-member-role': {
        organizationId: 'team-a',
        memberId: 'member-a',
        role: 'admin',
      },
      '/api/auth/organization/invite-member': {
        organizationId: 'team-a',
        email: 'invitee@example.com',
        role: 'member',
      },
      '/api/auth/organization/cancel-invitation': {
        invitationId: 'invitation-a',
      },
      '/api/auth/organization/accept-invitation': {
        invitationId: 'invitation-a',
      },
      '/api/auth/organization/reject-invitation': {
        invitationId: 'invitation-a',
      },
      '/api/auth/organization/remove-member': {
        organizationId: 'team-a',
        memberIdOrEmail: 'member-a',
      },
      '/api/auth/organization/leave': {
        organizationId: 'team-a',
      },
    };

    for (const path of BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS) {
      for (const requestedPath of [path, `${path}/`, `${path}?attempt=1`]) {
        const response = await app.request(requestedPath, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'origin': 'http://localhost:5173',
          },
          body: JSON.stringify(bodies[path]),
        });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          title: 'Not Found',
          status: 404,
        });
      }
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed for an unclassified Better Auth organization mutation', async () => {
    const handler = vi.fn(() =>
      Promise.resolve(Response.json({ wrote: true })),
    );
    const app = createApp(undefined, {
      auth: stubAuthService({ handler }),
    });

    const response = await app.request(
      '/api/auth/organization/future-team-write/?attempt=1',
      { method: 'POST' },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ title: 'Not Found', status: 404 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('forwards an explicitly classified Better Auth organization mutation', async () => {
    const handler = vi.fn(() =>
      Promise.resolve(Response.json({ available: true })),
    );
    const app = createApp(undefined, {
      auth: stubAuthService({ handler }),
    });

    const response = await app.request(
      '/api/auth/organization/check-slug/?slug=example',
      { method: 'POST' },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(handler).toHaveBeenCalledOnce();
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
