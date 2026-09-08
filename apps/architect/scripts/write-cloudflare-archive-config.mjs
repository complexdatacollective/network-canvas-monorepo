// Rewrites a built `dist/` for deployment to Cloudflare Workers Static Assets,
// which serves the archived copies of released Architect versions. Run AFTER
// the turbo-cached build (like write-build-info.mjs) so its output can never be
// baked into a cache entry that a Netlify build would restore.
//
// Netlify remains the production host, and `public/_headers` stays shaped for
// it. Two things differ on Cloudflare and both are load-bearing:
//
//  1. `_headers` rules APPEND rather than replace. Cloudflare's documentation:
//     "An incoming request which matches multiple rules' URL patterns will
//     inherit all rules' headers", joining repeated headers with a comma. On
//     Netlify the more specific rule replaces the value, which is what lets
//     `/assets/*` override the blanket `/*` no-store. Lifted unchanged, a
//     content-hashed asset comes back as
//       `no-store, no-cache, max-age=0, must-revalidate, public, max-age=31536000, immutable`
//     where `no-store` wins and every asset becomes uncacheable. So the
//     `Cache-Control` line is stripped from the `/*` rule here, leaving its
//     security headers to apply everywhere and each path's own Cache-Control
//     to stand alone.
//
//     The one path that loses a rule is the SPA deep link, which matches only
//     `/*` and therefore falls to Cloudflare's default for an unmatched asset,
//     `public, max-age=0, must-revalidate`. That revalidates before every reuse,
//     so a visitor still picks up the newer release when a later patch on the
//     same major line replaces the host's contents.
//
//     `/*` cannot simply keep its Cache-Control on Netlify's side either — see
//     scripts/assert-pwa-cache-headers.mjs, where `/*` covering deep-link HTML
//     is asserted precisely because Netlify matches `_headers` against the
//     requested URL before the SPA rewrite. That is why this transform happens
//     here and not in `public/_headers`.
//
//  2. `_redirects` is REJECTED. Netlify's `/* /index.html 200` fails the
//     Cloudflare deploy outright with "Infinite loop detected in this rule",
//     because Cloudflare's asset layer already strips `/index` and `.html`.
//     The SPA fallback is expressed as `not_found_handling` in the generated
//     Wrangler config instead, so the file is removed.
//
// Everything this script asserts is a hard failure. A silent no-op would ship
// an archive whose assets are uncacheable or whose deep links 404, and neither
// is visible without fetching the deployed site.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const usage = `Usage: write-cloudflare-archive-config.mjs --version <x.y.z> --zone <domain> [--dist <dir>] [--out <file>]`;

const parseArgs = (argv) => {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`${usage}\nUnrecognised argument: ${key}`);
    }
    args.set(key.slice(2), value);
  }
  return args;
};

/**
 * The archive is keyed by MAJOR version, not by individual release: major
 * versions track protocol schema versions, so the newest release on each major
 * line is the one worth keeping reachable. `8.2.5` and `8.3.0` both resolve to
 * `v8`, the later release replacing the earlier one at the same host.
 *
 * That makes an archive host mutable, which is why the cache contract below
 * matters more here than it would for a frozen snapshot: a visitor holding the
 * previous release's shell must revalidate and pick up the newer one.
 */
export const majorLabel = (version) => {
  const match = /^(\d+)\./.exec(version);
  if (!match) {
    throw new Error(
      `version "${version}" does not begin with a major version number`,
    );
  }
  return `v${match[1]}`;
};

/**
 * Parse a `_headers` file into ordered rules. Rule lines start at column 0 with
 * `/`; header lines are indented `Name: value`. Blank lines and `#` comments
 * carry no meaning beyond readability.
 */
const parseRules = (text) => {
  const rules = [];
  let current = null;

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      return;
    }
    if (line.startsWith('/')) {
      current = { pattern: trimmed, headers: [], line: index + 1 };
      rules.push(current);
      return;
    }
    if (!current) {
      throw new Error(`_headers line ${index + 1}: header outside any rule`);
    }
    const separator = trimmed.indexOf(':');
    if (separator === -1) {
      throw new Error(`_headers line ${index + 1}: expected "Name: value"`);
    }
    // Indexed, not by line content: the same `Cache-Control: no-store, ...`
    // line appears verbatim under `/*` and under every stable entry point, so
    // removing by text would strip the lot and silently drop the shell's
    // no-store contract on the way to a deploy that still looks plausible.
    current.headers.push({
      name: trimmed.slice(0, separator).trim(),
      index,
    });
  });

  return rules;
};

/**
 * Whether two `_headers` patterns can both match one request path. Only the
 * shapes this repository uses are understood — an exact path, or a prefix
 * ending in `/*`. Netlify's `:placeholder` segments would need real matching,
 * so they are refused rather than guessed at.
 */
const patternsOverlap = (a, b) => {
  for (const pattern of [a, b]) {
    if (pattern.includes(':') || pattern.slice(0, -1).includes('*')) {
      throw new Error(
        `_headers pattern "${pattern}" is not a plain path or "prefix/*"; ` +
          `overlap cannot be checked, so the archive transform refuses it`,
      );
    }
  }

  const aPrefix = a.endsWith('*') ? a.slice(0, -1) : null;
  const bPrefix = b.endsWith('*') ? b.slice(0, -1) : null;

  if (aPrefix !== null && bPrefix !== null) {
    return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
  }
  if (aPrefix !== null) {
    return b.startsWith(aPrefix);
  }
  if (bPrefix !== null) {
    return a.startsWith(bPrefix);
  }
  return a === b;
};

/**
 * Strip `Cache-Control` from the `/*` rule, then prove no request path can
 * still match two rules that both set it — the exact condition that produces a
 * contradictory joined header on Cloudflare.
 */
export const toCloudflareHeaders = (text) => {
  const rules = parseRules(text);

  const catchAll = rules.find((rule) => rule.pattern === '/*');
  if (!catchAll) {
    throw new Error('_headers has no "/*" rule; expected the shared PWA shape');
  }
  const removed = catchAll.headers.filter(
    (header) => header.name.toLowerCase() === 'cache-control',
  );
  if (removed.length !== 1) {
    throw new Error(
      `expected exactly one Cache-Control in the "/*" rule, found ${removed.length}.` +
        (removed.length === 0
          ? ' This dist may already have been transformed — the rewrite is not' +
            ' idempotent by design, so run it on a freshly built dist.'
          : ''),
    );
  }

  const dropped = new Set(removed.map((header) => header.index));
  const output = text
    .split('\n')
    .filter((_line, index) => !dropped.has(index))
    .join('\n');

  const cacheRules = parseRules(output).filter((rule) =>
    rule.headers.some(
      (header) => header.name.toLowerCase() === 'cache-control',
    ),
  );
  for (let i = 0; i < cacheRules.length; i += 1) {
    for (let j = i + 1; j < cacheRules.length; j += 1) {
      const [a, b] = [cacheRules[i], cacheRules[j]];
      if (patternsOverlap(a.pattern, b.pattern)) {
        throw new Error(
          `"${a.pattern}" and "${b.pattern}" both set Cache-Control and can match the ` +
            `same path. Cloudflare joins them into one contradictory header — ` +
            `separate the patterns before archiving.`,
        );
      }
    }
  }

  if (!cacheRules.some((rule) => rule.pattern === '/assets/*')) {
    throw new Error(
      '_headers lost its "/assets/*" Cache-Control; content-hashed assets would ' +
        "fall back to Cloudflare's revalidate-always default",
    );
  }

  return output;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const version = args.get('version');
  const zone = args.get('zone');
  if (!version || !zone) {
    throw new Error(usage);
  }

  const distDir = resolve(appDir, args.get('dist') ?? 'dist');
  const outFile = resolve(appDir, args.get('out') ?? 'wrangler.archive.json');
  const relativeDist = relative(dirname(outFile), distDir) || '.';
  const assetsDirectory = relativeDist.startsWith('.')
    ? relativeDist
    : `./${relativeDist}`;

  const headersPath = resolve(distDir, '_headers');
  writeFileSync(
    headersPath,
    toCloudflareHeaders(readFileSync(headersPath, 'utf8')),
  );

  // Netlify-only, and a hard deploy failure on Cloudflare. `force` so a rerun
  // against an already-transformed dist stays idempotent.
  rmSync(resolve(distDir, '_redirects'), { force: true });

  // Two labels deep. Cloudflare's Universal SSL wildcard covers only one level,
  // but a Workers custom domain provisions its own certificate for the exact
  // hostname (verified: the served cert carries a
  // `DNS:v<n>.architect.<zone>` SAN), so no Advanced Certificate Manager is
  // needed. It does take a few minutes the first time a host is created, which
  // the workflow's reachability poll allows for.
  const label = majorLabel(version);
  const hostname = `${label}.architect.${zone}`;

  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        name: `architect-${label}`,
        compatibility_date: '2026-09-01',
        // The archive must never be reachable on a hostname outside the zone.
        // The Mapbox token embedded in the Geospatial template is URL-restricted
        // to networkcanvas.com/.dev/localhost, so tile requests from a
        // *.workers.dev copy answer 403 and its maps are silently broken —
        // a subtly wrong archive is worse than none.
        workers_dev: false,
        preview_urls: false,
        assets: {
          // Wrangler resolves this against the config file's own directory, so
          // it is derived rather than echoed back from --dist: an absolute
          // --dist (archiving a build made in another checkout, say) would
          // otherwise be concatenated into a path that does not exist.
          directory: assetsDirectory,
          // Replaces Netlify's `_redirects` SPA rule, which Cloudflare rejects.
          // `html_handling` is left at its default: `/index.html` 307s to `/`,
          // which differs from Netlify but is exercised by the deploy check.
          not_found_handling: 'single-page-application',
        },
        // custom_domain provisions the DNS record and the certificate, so the
        // lane needs no separate Cloudflare DNS call.
        routes: [{ pattern: hostname, custom_domain: true }],
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(`${JSON.stringify({ hostname, label, outFile })}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
