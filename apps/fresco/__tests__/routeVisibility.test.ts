import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Fresco's URL space is split by who may reach it, so that a reverse proxy can
 * put every researcher surface behind an institutional network boundary with a
 * single rule: allow the public prefixes, restrict everything else. The
 * contract is written down in ../SECURITY.md and ../app/README.md; this test is
 * what keeps it true as routes are added.
 */

/** Reachable from the public Internet: participants and platform callbacks. */
const PUBLIC_PREFIXES = ['/interview/', '/onboard/', '/api/public/'];

/**
 * Researcher-only. Every route must fall under one of these or under a public
 * prefix. A route that matches neither has not been classified and fails the
 * classification test below — which is the point: adding a URL to Fresco means
 * deciding which side of the boundary it lives on.
 */
const PRIVATE_PREFIXES = [
  '/dashboard/',
  '/signin/',
  '/setup/',
  '/expired/',
  '/reset/',
  '/api/[version]/',
  '/api/export-interviews/',
  '/api/generate-test-interviews/',
  '/api/storage/',
];

/** The site root redirects to the dashboard or the sign-in page. */
const PRIVATE_EXACT = ['/'];

/**
 * The guards a researcher-only route handler under /api/ must call: the
 * session check behind the dashboard's own fetches, and the bearer-token check
 * of the Interview Data API.
 */
const API_GUARDS = [
  { name: 'requireApiAuth', from: '~/lib/auth/guards' },
  { name: 'requireApiTokenAuth', from: '~/app/api/_helpers/auth' },
];

const APP_DIR = path.join(import.meta.dirname, '..', 'app');
const ROUTE_FILE = /^(page|route)\.(t|j)sx?$/;

type RouteFile = {
  /**
   * The URL with a trailing slash (`/` for the root), so a prefix can only
   * match whole segments: `/api/public/` never matches `/api/publicity/`.
   */
  url: string;
  /** Relative to `app/`. */
  file: string;
  kind: 'page' | 'route';
};

/**
 * Derive each routable file's URL the way the App Router does: a `(group)`
 * directory adds no segment, a `_private` directory (and everything beneath it)
 * is not routable at all, and a dynamic segment keeps its bracketed name.
 */
function collectRouteFiles(dir: string, segments: string[]): RouteFile[] {
  const found: RouteFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue;
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
      found.push(
        ...collectRouteFiles(
          path.join(dir, entry.name),
          isGroup ? segments : [...segments, entry.name],
        ),
      );
      continue;
    }
    const match = ROUTE_FILE.exec(entry.name);
    if (!match) continue;
    found.push({
      url: segments.length === 0 ? '/' : `/${segments.join('/')}/`,
      file: path.relative(APP_DIR, path.join(dir, entry.name)),
      kind: match[1] === 'page' ? 'page' : 'route',
    });
  }
  return found;
}

const isPublic = (url: string) =>
  PUBLIC_PREFIXES.some((prefix) => url.startsWith(prefix));
const isPrivate = (url: string) =>
  PRIVATE_EXACT.includes(url) ||
  PRIVATE_PREFIXES.some((prefix) => url.startsWith(prefix));

/**
 * Comments are removed before looking for a guard, so a handler that only
 * mentions `requireApiAuth()` in prose cannot pass as one that calls it.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The guards a route handler both imports from its home module and calls. */
function guardsCalled(file: string): string[] {
  const code = stripComments(readFileSync(path.join(APP_DIR, file), 'utf8'));
  return API_GUARDS.filter(({ name, from }) => {
    const imported = new RegExp(
      `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'${from}'`,
    ).test(code);
    const called = new RegExp(`\\b${name}\\s*\\(`).test(code);
    return imported && called;
  }).map(({ name }) => name);
}

const routeFiles = collectRouteFiles(APP_DIR, []);

/**
 * The URLs the application asks for by hand. Each is a literal in code that
 * must name a route that exists and is public: the participant's browser and
 * the UploadThing SDK request them from outside, so a route moved without its
 * caller is a 404 in production that nothing else here would catch.
 */
const CALL_SITES = [
  {
    what: "the interview shell's finish request",
    file: path.join(
      APP_DIR,
      '(interview)/interview/[interviewId]/InterviewClient.tsx',
    ),
    pattern: /fetch\(`(\/[^`$]*)\$\{id\}(\/finish)`/,
    /** `${id}` stands in for the dynamic segment the route file declares. */
    url: (m: RegExpExecArray) => `${m[1]}[interviewId]${m[2]}/`,
  },
  {
    what: "the UploadThing uploader's endpoint",
    file: path.join(APP_DIR, '..', 'lib/uploadthing/client-helpers.ts'),
    pattern: /url:\s*'([^']+)'/,
    url: (m: RegExpExecArray) => `${m[1]}/`,
  },
  {
    what: 'the URL the S3 backend stores for an uploaded asset',
    file: path.join(APP_DIR, '..', 'lib/storage/layers/S3AssetStorage.ts'),
    pattern: /publicUrl: `(\/[^`$]*)\$\{fileKey\}`/,
    url: (m: RegExpExecArray) => `${m[1]}[key]/`,
  },
] as const;

describe('hand-written URLs', () => {
  it.each(CALL_SITES)('$what names a public route that exists', (site) => {
    const source = stripComments(readFileSync(site.file, 'utf8'));
    const match = site.pattern.exec(source);
    expect(
      match,
      `No URL matched in ${path.basename(site.file)}. If the call site was ` +
        'rewritten, update the pattern here rather than deleting the check.',
    ).not.toBeNull();

    const url = site.url(match!);
    expect(routeFiles.map((route) => route.url)).toContain(url);
    expect(isPublic(url), `${url} is not under a public prefix`).toBe(true);
  });
});

describe('route visibility', () => {
  // Positive controls: a walker that silently found nothing, or derived URLs
  // some other way, would let the classification test pass over an empty list.
  it('walks the routes it exists to classify', () => {
    const urls = routeFiles.map((route) => route.url);
    expect(urls).toContain('/');
    expect(urls).toContain('/interview/[interviewId]/');
    expect(urls).toContain('/interview/[interviewId]/sync/');
    expect(urls).toContain('/api/public/health/');
    expect(urls).toContain('/dashboard/');
  });

  it('detects each guard in a handler known to call it', () => {
    expect(guardsCalled('api/storage/presign/route.ts')).toEqual([
      'requireApiAuth',
    ]);
    expect(guardsCalled('api/[version]/interview/route.ts')).toEqual([
      'requireApiTokenAuth',
    ]);
  });

  it('keeps the public and researcher-only prefixes disjoint', () => {
    expect(PUBLIC_PREFIXES.filter(isPrivate)).toEqual([]);
    expect(PRIVATE_PREFIXES.filter(isPublic)).toEqual([]);
  });

  it('places every page and route handler under a public or a researcher-only prefix', () => {
    expect(routeFiles.length).toBeGreaterThan(0);

    const unclassified = routeFiles
      .filter((route) => !isPublic(route.url) && !isPrivate(route.url))
      .map((route) => `${route.url} (app/${route.file})`);

    expect(
      unclassified,
      'Unclassified routes. Decide who may reach each one: put it under an ' +
        'existing prefix, or add the prefix to PUBLIC_PREFIXES or ' +
        'PRIVATE_PREFIXES here and to SECURITY.md.',
    ).toEqual([]);
  });

  it('guards every researcher-only route handler under /api/ with a session or token check', () => {
    const handlers = routeFiles.filter(
      (route) =>
        route.kind === 'route' &&
        route.url.startsWith('/api/') &&
        isPrivate(route.url),
    );
    expect(handlers.length).toBeGreaterThan(0);

    const unguarded = handlers
      .filter((route) => guardsCalled(route.file).length === 0)
      .map((route) => `app/${route.file}`);

    expect(
      unguarded,
      'Researcher-only API handlers that call neither requireApiAuth nor ' +
        'requireApiTokenAuth. Add the check, or move the route under ' +
        '/api/public/ if it is meant to be reachable by anyone.',
    ).toEqual([]);
  });

  it('never guards a public route handler with a researcher credential', () => {
    const handlers = routeFiles.filter(
      (route) => route.kind === 'route' && isPublic(route.url),
    );
    expect(handlers.length).toBeGreaterThan(0);

    const guarded = handlers
      .filter((route) => guardsCalled(route.file).length > 0)
      .map(
        (route) => `app/${route.file}: ${guardsCalled(route.file).join(', ')}`,
      );

    expect(
      guarded,
      'Public route handlers that require a researcher credential. A route ' +
        'only a researcher can use belongs outside the public prefixes.',
    ).toEqual([]);
  });
});
