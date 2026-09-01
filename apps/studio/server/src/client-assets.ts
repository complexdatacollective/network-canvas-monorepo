import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, Hono } from 'hono';

import { gatedSurfacePaths } from '@codaco/studio-rpc/surfaces';

import type { PrincipalVariables } from './auth/principal.ts';
import type { StudioEnv } from './env.ts';

// Serving the built client, and refusing the paths this deployment's topology
// does not have. Extracted from src/index.ts because that module cannot be
// imported by a test: at module scope it reads the environment, opens two
// connection pools, awaits the schema check, binds a port and installs signal
// handlers.

const SHELL_FILE = 'index.html';

/**
 * A gated route path compiled to a matcher over a NORMALISED request path.
 *
 * `$param` becomes a single-segment wildcard. Everything else is escaped, so a
 * literal `.` in a path cannot match any character.
 */
function gatedMatcher(routePath: string): RegExp {
  const source = routePath
    .split('/')
    .map((segment) =>
      segment.startsWith('$')
        ? '[^/]+'
        : segment.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
    )
    .join('/');
  return new RegExp(`^${source}$`);
}

/**
 * The request path reduced to the one spelling the decision is made about.
 *
 * Not a redirect and not what gets served — only what the gate compares. It
 * exists because the two routers disagree about what counts as the same path:
 * TanStack Router matches case-insensitively (`caseSensitive` defaults to
 * false, and the client does not set it) and tolerates duplicate slashes,
 * while Hono matches literally. Enumerating the variants was the earlier
 * approach and it missed the ones nobody thought of — `/Pricing` and
 * `//pricing` both reached the SPA fallback's 200 and rendered the page the
 * gate exists to withhold, and `/Setup` did the same to first-run
 * configuration in the other direction.
 *
 * Over-gating is not a risk here: if a normalised path collides with one the
 * topology does serve, the client resolves both spellings to that same route.
 */
function normaliseForGate(path: string): string {
  const collapsed = path.replaceAll(/\/{2,}/g, '/').toLowerCase();
  return collapsed.length > 1 && collapsed.endsWith('/')
    ? collapsed.slice(0, -1)
    : collapsed;
}

// Hashed build assets are immutable by construction; the app shell must
// revalidate every load so deploys take effect (and open tabs keep resolving
// old hashed chunks from the CDN, not from here).
function setCacheHeader(path: string, c: Context) {
  c.header(
    'Cache-Control',
    path.endsWith('index.html')
      ? 'no-store'
      : path.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
  );
}

/**
 * Read per request rather than cached, so a shell rebuilt under a running
 * server is picked up — and so a deployment whose client assets live on a CDN
 * still answers, with an empty body behind an honest status line.
 */
async function readShell(clientRoot: string): Promise<string | undefined> {
  try {
    return await readFile(join(clientRoot, SHELL_FILE), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Mounts the static client assets and the SPA fallback. Called only by the
 * entrypoint that serves them — the self-host topology, and development;
 * the managed topology serves the client from a CDN.
 */
export function mountClient(
  app: Hono<PrincipalVariables>,
  env: StudioEnv,
): void {
  // Default matches the Docker image layout: dist/index.js next to a client/
  // directory. `pnpm start` overrides via CLIENT_DIST for the local layout.
  const clientRoot = env.clientDist
    ? resolve(process.cwd(), env.clientDist)
    : fileURLToPath(new URL('../client', import.meta.url));

  // The deployment-mode gate, registered BEFORE both serveStatic mounts,
  // which would otherwise answer these with the shell at 200 — the SPA
  // fallback cannot tell a route this topology does not have from one it
  // does. A client-side `throw notFound()` is not a substitute: it is a
  // marker object with no status, and Studio's client has no SSR entry that
  // could turn one into a status line. It stays the courtesy layer, for
  // in-app navigations where no request is made.
  //
  // Matched over a normalised path rather than a list of spellings, because
  // the client resolves more spellings to a route than Hono matches
  // literally — see `normaliseForGate`.
  const gatedMatchers = gatedSurfacePaths(env.deploymentMode).map(gatedMatcher);
  // GET alone covers HEAD: Hono answers a HEAD by dispatching the GET
  // handler and dropping the body, so a probe sees the status the gate set.
  app.on('GET', '*', async (c, next) => {
    const path = normaliseForGate(c.req.path);
    if (!gatedMatchers.some((matcher) => matcher.test(path))) return next();

    // The body is still the shell, so the client renders its branded
    // not-found state; no-store because a corrected variable — or the same
    // image deployed in the other topology — turns this into a page.
    c.header('Cache-Control', 'no-store');
    const shell = await readShell(clientRoot);
    return shell === undefined ? c.body(null, 404) : c.html(shell, 404);
  });

  app.use('*', serveStatic({ root: clientRoot, onFound: setCacheHeader }));
  // SPA fallback: unmatched GET paths serve the app shell so client-side
  // routes deep-link correctly.
  app.get(
    '*',
    serveStatic({
      root: clientRoot,
      path: 'index.html',
      onFound: setCacheHeader,
    }),
  );
}
