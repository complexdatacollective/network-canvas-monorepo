import { describe, expect, it } from 'vitest';

import type { DeploymentMode } from '@codaco/studio-rpc/surfaces';

import { createApp } from '../app.ts';
import { resolve } from '../env/resolve.ts';
import { createRpcClient } from './support/rpc.ts';

// What is left of the deployment-mode gate after #1909: the mode itself.
//
// The server used to refuse the other topology's page paths at the HTTP layer,
// because it served the client. It does not serve the client any more — nginx
// does, from the studio-web image — so it sees no page path to refuse, and the
// gate and its suite are gone with `src/client-assets.ts`. The classification
// is enforced in the one place that still sees those paths: the client's route
// tree (`client/src/lib/deployment.ts`, tested there).
//
// What the server still owns is telling the client which topology it is, which
// is the whole input to that guard — so a server that reported the wrong mode,
// or stopped reporting one, would disable the guard everywhere at once.
//
// No database: this drives `app.request()` against an env with no DATABASE_URL,
// so it runs in every lane.

function appFor(deploymentMode: DeploymentMode) {
  return createApp(
    resolve({ NODE_ENV: 'test', STUDIO_DEPLOYMENT_MODE: deploymentMode }),
  );
}

describe('the deployment mode over RPC', () => {
  it.each(['self-hosted', 'managed'] as const)(
    'reports %s as configured',
    async (mode) => {
      const status = await createRpcClient(appFor(mode)).status();
      expect(status.deployment).toEqual({ mode, billing: false });
    },
  );

  it('reports self-hosted when nothing is configured', async () => {
    // The fail-closed direction, and the reason `variables.ts` declares no
    // default: a managed deployment that forgets the variable 404s its own
    // pricing page on the first smoke request, where the opposite default
    // would have an institution's instance quietly publishing one.
    const status = await createRpcClient(
      createApp(resolve({ NODE_ENV: 'test' })),
    ).status();
    expect(status.deployment).toEqual({ mode: 'self-hosted', billing: false });
  });

  it('does not name the deployment on the public API', async () => {
    // The public surface's output schema is the serialization allowlist
    // (#1248): the SPA's deployment block must not leak into it.
    const response = await appFor('managed').request('/api/v1/status');
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('deployment');
  });
});

describe('the machine surfaces', () => {
  const app = appFor('self-hosted');

  it.each(['/api/v1/nope', '/rpc/nope', '/storage/deadbeef/extra'])(
    'refuses %s as problem JSON',
    async (path) => {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
    },
  );

  it('refuses a page path rather than serving one', async () => {
    // The positive statement of "the server serves no client": a path the SPA
    // owns has no handler here at all, in either topology, so nothing can
    // answer a page request with a shell this process does not have.
    for (const mode of ['self-hosted', 'managed'] as const) {
      for (const path of ['/', '/pricing', '/setup']) {
        expect({
          mode,
          path,
          status: (await appFor(mode).request(path)).status,
        }).toEqual({ mode, path, status: 404 });
      }
    }
  });
});
