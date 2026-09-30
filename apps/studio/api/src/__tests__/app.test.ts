import { Effect, Layer, Option } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { openApiDocument } from '@codaco/studio-contract/api/v1';

import { createStudio } from '../app.ts';
import { BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS } from '../audit/better-auth-policy.ts';
import type { AuthService } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import { STUDIO_VERSION } from '../version.ts';
import { authServiceStub } from './support/auth.ts';
import { createRpcClient } from './support/rpc.ts';
import { composeStudio } from './support/serve.ts';

/**
 * The composed stack with better-auth's web handler stubbed: `/api/auth/*` is
 * the Effect router's auth mount, so its organization-policy gate is only
 * reachable through the stack.
 */
function authMountWith(handler: AuthService['Service']['handler']) {
  const env = readEnv();
  return composeStudio(
    env,
    createStudio(env, { auth: authServiceStub({ handler }) }),
  );
}

describe('studio server', () => {
  it('reports healthy on /healthz', async () => {
    // Through the composed stack: liveness is an Effect route
    // (src/http/health.ts).
    const env = readEnv();
    const stack = composeStudio(env, createStudio(env));
    try {
      const res = await stack.request('/healthz');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    } finally {
      await stack.dispose();
    }
  });

  it('serves instance status from the versioned API', async () => {
    const env = readEnv();
    const stack = composeStudio(env, createStudio(env));
    try {
      const res = await stack.request('/api/v1/status');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      const body = (await res.json()) as Record<string, unknown>;
      // The public surface's output schema is the serialization allowlist
      // (#1248): the SPA-facing auth, deployment and setup blocks the domain
      // hands the handler must never reach this wire.
      expect(Object.keys(body).sort()).toEqual(['name', 'version']);
      expect(body.name).toBe('Network Canvas Studio');
      expect(body.version).toBe(STUDIO_VERSION);
    } finally {
      await stack.dispose();
    }
  });

  it('publishes the contract’s OpenAPI document beside the API', async () => {
    const env = readEnv();
    const stack = composeStudio(env, createStudio(env));
    try {
      const res = await stack.request('/api/v1/openapi.json');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(openApiDocument());
    } finally {
      await stack.dispose();
    }
  });

  it('serves an API reference page for the document', async () => {
    const env = readEnv();
    const stack = composeStudio(env, createStudio(env));
    try {
      const res = await stack.request('/api/v1/docs');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      const page = await res.text();
      expect(page).toContain('<title>Network Canvas Studio API</title>');
      expect(page).toContain('Scalar.createApiReference');
    } finally {
      await stack.dispose();
    }
  });

  it.each([
    ['GET', '/api/v1/nope'],
    ['GET', '/api/v1'],
    ['POST', '/api/v1/status'],
    ['DELETE', '/api/v1/status'],
  ])('does not serve %s %s, refusing as problem JSON', async (method, path) => {
    const env = readEnv();
    const stack = composeStudio(env, createStudio(env));
    try {
      const res = await stack.request(path, { method });
      expect(res.status).toBe(404);
      // The guarantee is RFC 9457 problem details — never a fall-through to
      // the SPA fallback's HTML.
      expect(res.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
      expect(await res.json()).toEqual({ title: 'Not Found', status: 404 });
    } finally {
      await stack.dispose();
    }
  });

  it('serves instance status over the typed RPC surface', async () => {
    const client = await createRpcClient(createStudio());
    try {
      const status = await client.call(client.rpc('status', undefined));
      expect(status.name).toBe('Network Canvas Studio');
      expect(status.version).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      await client.dispose();
    }
  });

  it('does not serve unknown RPC paths', async () => {
    const env = readEnv();
    const stack = composeStudio(env, createStudio(env));
    try {
      const res = await stack.request('/rpc/nope', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
      });
      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
      expect(await res.json()).toEqual({ title: 'Not Found', status: 404 });
    } finally {
      await stack.dispose();
    }
  });

  it('refuses audited team writes before Better Auth can mutate them', async () => {
    const handler = vi.fn(() => Effect.succeed(Response.json({ wrote: true })));
    const app = authMountWith(handler);
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
    await app.dispose();
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed for an unclassified Better Auth organization mutation', async () => {
    const handler = vi.fn(() => Effect.succeed(Response.json({ wrote: true })));
    const app = authMountWith(handler);

    const response = await app.request(
      '/api/auth/organization/future-team-write/?attempt=1',
      { method: 'POST' },
    );
    await app.dispose();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ title: 'Not Found', status: 404 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('forwards an explicitly classified Better Auth organization mutation', async () => {
    const handler = vi.fn(() =>
      Effect.succeed(Response.json({ available: true })),
    );
    const app = authMountWith(handler);

    // Mutation: skip the trailing-slash normalisation before the policy
    // lookup → this allowed route reads as unclassified and 404s.
    const response = await app.request(
      '/api/auth/organization/check-slug/?slug=example',
      { method: 'POST' },
    );
    await app.dispose();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not serve unmatched machine-surface paths', async () => {
    const env = readEnv();
    const stack = composeStudio(env, createStudio(env));
    try {
      // An API, RPC or asset caller must never be handed a 200 to cache: a
      // path no route claims under a machine prefix is the router's 404, as
      // problem JSON.
      for (const path of [
        '/api',
        '/api/nope',
        '/rpc/',
        '/storage',
        '/storage/',
        '/storage/deadbeef/extra',
      ]) {
        const res = await stack.request(path);
        expect(res.status, path).toBe(404);
        expect(res.headers.get('Content-Type'), path).toContain(
          'application/problem+json',
        );
        expect(await res.json(), path).toEqual({
          title: 'Not Found',
          status: 404,
        });
      }
    } finally {
      await stack.dispose();
    }
  });
  it('closes unmatched paths too while the instance is in maintenance', async () => {
    // No route claims these, so it is the gate, a global middleware, that has
    // to answer them — there is no catch-all route behind it any more.
    const env = readEnv();
    const closed = Layer.succeed(MaintenanceTriggers)(
      MaintenanceTriggers.of({
        closure: Effect.succeed(
          Option.some({
            trigger: 'maintenance' as const,
            detail: 'maintenance mode is on',
          }),
        ),
      }),
    );
    const stack = composeStudio(env, createStudio(env), undefined, closed);
    try {
      for (const path of ['/nope', '/', '/api/nope', '/storage/']) {
        const res = await stack.request(path);
        expect(res.status, path).toBe(503);
        expect(res.headers.get('Content-Type'), path).toContain(
          'application/problem+json',
        );
      }
      expect((await stack.request('/healthz')).status).toBe(200);
    } finally {
      await stack.dispose();
    }
  });
});
