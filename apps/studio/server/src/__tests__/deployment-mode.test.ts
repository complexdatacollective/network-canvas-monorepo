import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  type DeploymentMode,
  gatedSurfacePaths,
  MANAGED_ONLY_PATHS,
  SELF_HOST_ONLY_PATHS,
} from '@codaco/studio-rpc/surfaces';

import { createApp } from '../app.ts';
import { mountClient } from '../client-assets.ts';
import { resolve } from '../env/resolve.ts';
import { createRpcClient } from './support/rpc.ts';

// The deployment-mode gate, at the layer it lives at. `notFound()` on the
// client is a marker object with no status, and both serveStatic mounts
// answer an unmatched GET with the shell at 200 — so the oracle here is the
// HTTP status code, which is exactly what the gate has to change.
//
// No database: this suite drives `app.request()` against an env with no
// DATABASE_URL, so it runs in every lane.

const SHELL = '<!doctype html><title>Studio</title><div id="root"></div>';

const clientDist = mkdtempSync(join(tmpdir(), 'studio-client-dist-'));
writeFileSync(join(clientDist, 'index.html'), SHELL);

afterAll(() => {
  rmSync(clientDist, { recursive: true, force: true });
});

function appFor(deploymentMode: DeploymentMode) {
  const env = resolve({
    NODE_ENV: 'test',
    CLIENT_DIST: clientDist,
    STUDIO_DEPLOYMENT_MODE: deploymentMode,
  });
  const app = createApp(env);
  mountClient(app, env);
  return app;
}

/** A concrete URL for a route path: `/legal/$document` ⇒ `/legal/sample`. */
function requestPath(routePath: string): string {
  return routePath.replaceAll(/\$[A-Za-z0-9_]+/g, 'sample');
}

async function expectGatedShell(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get('Content-Type')).toContain('text/html');
  // The body is the shell, so the refusal can be rendered in the app's own
  // design once the client guards these routes; what this layer owes is the
  // honest status line.
  expect(await response.text()).toBe(SHELL);
  // Nothing may cache a refusal that a redeploy in the other topology, or a
  // corrected variable, turns into a page.
  expect(response.headers.get('Cache-Control')).toBe('no-store');
}

describe('a self-hosted deployment', () => {
  const app = appFor('self-hosted');

  it.each([...MANAGED_ONLY_PATHS])('refuses %s', async (routePath) => {
    await expectGatedShell(await app.request(requestPath(routePath)));
  });

  it.each([...MANAGED_ONLY_PATHS])(
    'refuses %s with a trailing slash',
    async (routePath) => {
      // Otherwise `/pricing/` is a one-character bypass back onto the SPA
      // fallback's 200.
      await expectGatedShell(await app.request(`${requestPath(routePath)}/`));
    },
  );

  it.each([...MANAGED_ONLY_PATHS])(
    'refuses %s however it is spelled',
    async (routePath) => {
      // The client resolves more spellings to a route than Hono matches
      // literally: TanStack Router's `caseSensitive` defaults to false and it
      // tolerates duplicate slashes. Enumerating the variants missed these,
      // and each one reached the SPA fallback's 200 and rendered the page the
      // gate exists to withhold.
      const path = requestPath(routePath);

      await expectGatedShell(await app.request(path.toUpperCase()));
      await expectGatedShell(await app.request(`${path}//`));
      await expectGatedShell(await app.request(`/${path}`));
    },
  );

  it('refuses a HEAD probe as well as a GET', async () => {
    // Hono answers HEAD by dispatching the GET handler and dropping the
    // body, so the status line is the entire answer a probe gets — and
    // ungated it would be the SPA fallback's 200.
    const response = await app.request('/pricing', { method: 'HEAD' });
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serves its own first-run setup', async () => {
    const response = await app.request('/setup');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SHELL);
  });

  it('serves the origin root', async () => {
    // The URL a self-hoster hands their researchers.
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SHELL);
  });

  it('reports the mode over RPC', async () => {
    const status = await createRpcClient(app).status();
    expect(status.deployment).toEqual({ mode: 'self-hosted', billing: false });
  });
});

describe('a managed deployment', () => {
  const app = appFor('managed');

  it.each([...MANAGED_ONLY_PATHS])('serves %s', async (routePath) => {
    const response = await app.request(requestPath(routePath));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SHELL);
  });

  it.each([...SELF_HOST_ONLY_PATHS])(
    'refuses %s, so no tenant reaches first-run configuration',
    async (routePath) => {
      await expectGatedShell(await app.request(requestPath(routePath)));
      await expectGatedShell(await app.request(`${requestPath(routePath)}/`));
    },
  );

  it('refuses first-run setup however it is spelled', async () => {
    // The higher-stakes direction: first-run configuration of the whole
    // instance, reachable on a managed tenant by one capital letter.
    await expectGatedShell(await app.request('/Setup'));
    await expectGatedShell(await app.request('/SETUP'));
    await expectGatedShell(await app.request('/setup//'));
    await expectGatedShell(await app.request('//setup'));
  });

  it('serves the origin root', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(200);
  });

  it('reports the mode over RPC', async () => {
    const status = await createRpcClient(app).status();
    expect(status.deployment).toEqual({ mode: 'managed', billing: false });
  });
});

describe('the machine surfaces under the gate', () => {
  // The gate registers before both serveStatic mounts; the problem-JSON
  // catch-alls must still win on their own prefixes.
  const app = appFor('self-hosted');

  it.each(['/api/v1/nope', '/rpc/nope', '/storage/deadbeef/extra'])(
    'still refuses %s as problem JSON',
    async (path) => {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toContain(
        'application/problem+json',
      );
    },
  );

  it('does not name the deployment on the public API', async () => {
    // The public surface's output schema is the serialization allowlist
    // (#1248): the SPA's deployment block must not leak into it.
    const response = await app.request('/api/v1/status');
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('deployment');
  });
});

// ---------------------------------------------------------------------------
// The managed Netlify lane, where the gate above never runs.
// ---------------------------------------------------------------------------

const NETLIFY_TOML = fileURLToPath(
  new URL('../../../netlify.toml', import.meta.url),
);

type RedirectRule = { from: string; status: number };

/**
 * netlify.toml's redirect rules in file order, which is match order: Netlify
 * applies the first rule whose `from` matches, so a refusal written after the
 * SPA catch-all would never run.
 *
 * Comments are stripped first. That file's prose quotes both paths and status
 * codes, and a commented-out rule must not read as a live one.
 */
function redirectRules(): RedirectRule[] {
  const source = readFileSync(NETLIFY_TOML, 'utf8').replaceAll(
    /^[ \t]*#.*$/gm,
    '',
  );
  return (
    source
      .split(/^\[\[redirects\]\]$/m)
      .slice(1)
      // A rule ends at the next table header, so a table following the last
      // rule cannot be absorbed into it.
      .map((block) => block.split(/^\[/m)[0] ?? '')
      .map((block) => ({
        from: /^from = "([^"]*)"$/m.exec(block)?.[1] ?? '',
        status: Number(/^status = (\d+)$/m.exec(block)?.[1]),
      }))
  );
}

/** A route path in Netlify's spelling: `/legal/$document` ⇒ `/legal/:document`. */
function netlifyPath(routePath: string): string {
  return routePath.replaceAll(/\$([A-Za-z0-9_]+)/g, ':$1');
}

describe("the managed lane's CDN rules", () => {
  // This site serves the client from the CDN, and src/netlify.ts's
  // `config.path` claims only the machine surfaces — so no function runs for a
  // page path and `mountClient`'s gate cannot answer here at all. What the CDN
  // can express is a rule with a 404 status, and these tests are what stop
  // that hand-written rule drifting from the classification the gate reads.
  const rules = redirectRules();
  const fallback = rules.findIndex((rule) => rule.from === '/*');

  it('keeps the SPA fallback last, so a refusal can precede it', () => {
    expect(rules[fallback]).toEqual({ from: '/*', status: 200 });
    expect(fallback).toBe(rules.length - 1);
  });

  it.each([...gatedSurfacePaths('managed')])(
    'refuses %s ahead of that fallback',
    (routePath) => {
      const from = netlifyPath(routePath);
      const index = rules.findIndex((rule) => rule.from === from);

      expect({
        from,
        status: index === -1 ? undefined : rules[index]?.status,
        aheadOfFallback: index !== -1 && index < fallback,
      }).toEqual({ from, status: 404, aheadOfFallback: true });
    },
  );

  it('still serves the surfaces this topology does have', () => {
    // The other list pasted here would refuse the managed service its own
    // pricing page — the failure the fail-closed default is loud about, made
    // silent again by a config file nothing checks.
    const refused = rules
      .filter((rule) => rule.status === 404)
      .map((rule) => rule.from);

    expect(
      MANAGED_ONLY_PATHS.filter((path) => refused.includes(netlifyPath(path))),
    ).toEqual([]);
  });
});
