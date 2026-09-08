import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The `exports` map, in both directions, because nothing else checks it.
 *
 * `scripts/verify-publish-exports.mjs` — the guard that proves every published
 * package's map resolves into its tarball — skips this one: it has no
 * `publishConfig` swap and is `private`, so there is no pack step and no
 * `dist/` for it to walk. That is correct, and it leaves a 60-entry
 * hand-written map with nothing looking at it at all. A subpath pointing at a
 * file that has moved fails only when a consumer imports it, and a module a
 * consumer imports that is NOT in the map fails only in that consumer's build.
 *
 * Both are asked here instead:
 *
 * - every declared subpath resolves to a file that exists under `src/`, and
 * - every `@codaco/protocol-builder/…` specifier written anywhere in a
 *   workspace that depends on this package names a subpath the map declares.
 *
 * The consumers are discovered from their manifests rather than listed, so a
 * fourth workspace taking a dependency on this package is scanned the day it
 * does.
 */
const packageRoot = process.cwd();
const repoRoot = join(packageRoot, '..', '..');

const PACKAGE_NAME = '@codaco/protocol-builder';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css'];

/** Directories a scan must not walk into: output, caches and installed code. */
const SKIPPED = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'test-results',
  'playwright-report',
  '.turbo',
  '.next',
  '.git',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readManifest = (path: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error(`${path} is not a JSON object.`);
  }
  return parsed;
};

const manifest = readManifest(join(packageRoot, 'package.json'));

const exportsMap = (): Readonly<Record<string, string>> => {
  const map = manifest.exports;
  if (!isRecord(map)) {
    throw new Error('This package declares no `exports` map.');
  }
  const entries = Object.entries(map).map(([subpath, target]) => {
    if (typeof target !== 'string') {
      throw new Error(
        `The "${subpath}" export is a conditions object; this guard reads the single-target form the whole map uses.`,
      );
    }
    return [subpath, target] as const;
  });
  return Object.fromEntries(entries);
};

/**
 * The workspace roots `pnpm-workspace.yaml` names, expanded one level.
 *
 * Read from the workspace file rather than written out, so a new root — the
 * way `apps/studio/*` was added for Studio's halves — is covered without this
 * test being edited.
 */
const workspaceDirectories = (): string[] => {
  const contents = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const globs = [...contents.matchAll(/^ {2}- (.+)$/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1].trim()],
  );

  return globs.flatMap((glob) => {
    if (!glob.endsWith('/*')) return [join(repoRoot, glob)];
    const parent = join(repoRoot, glob.slice(0, -2));
    if (!existsSync(parent)) return [];
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIPPED.has(entry.name))
      .map((entry) => join(parent, entry.name));
  });
};

/** Every workspace whose manifest takes a dependency on this package. */
const consumingWorkspaces = (): string[] =>
  workspaceDirectories().filter((directory) => {
    const manifestPath = join(directory, 'package.json');
    if (!existsSync(manifestPath)) return false;
    const consumer = readManifest(manifestPath);
    return DEPENDENCY_FIELDS.some((field) => {
      const declared = consumer[field];
      return isRecord(declared) && PACKAGE_NAME in declared;
    });
  });

const sourceFilesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });

/**
 * Every specifier naming this package, in the positions a resolver reads.
 *
 * The import forms rather than any quoted occurrence, and the distinction is
 * not academic: `apps/studio/client/vite.config.ts` lists the package's bare
 * name in `optimizeDeps.exclude`, which is a package to leave unbundled rather
 * than a module to resolve, and a plain string search reports it as an
 * undeclared `.` subpath. The shape mirrors `packageImportBoundaries.test.ts`'s
 * specifier pattern, and catches the CSS `@import` too.
 */
const PACKAGE_SPECIFIER = new RegExp(
  String.raw`(?:from|import|require)\s*\(?\s*['"]${PACKAGE_NAME}(/[^'"]*)?['"]`,
  'g',
);

type Usage = Readonly<{ subpath: string; file: string }>;

const specifiersInConsumers = (): Usage[] =>
  consumingWorkspaces().flatMap((workspace) =>
    sourceFilesUnder(workspace).flatMap((file) => {
      const contents = readFileSync(file, 'utf8');
      return [...contents.matchAll(PACKAGE_SPECIFIER)].map((match) => ({
        subpath: match[1] === undefined ? '.' : `.${match[1]}`,
        file,
      }));
    }),
  );

describe('the package exports map', () => {
  /**
   * Every reading below is a file-system walk from the runner's working
   * directory, so a runner that moved would find no consumers, no specifiers
   * and no defects. Asserted against landmarks each half needs, rather than
   * assumed.
   */
  it('is looking at this package inside this repository', () => {
    expect(manifest.name).toBe(PACKAGE_NAME);
    expect(manifest.private).toBe(true);
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
    // Studio and Architect both depend on it today; the count is a floor, so
    // this stays true as consumers are added.
    expect(consumingWorkspaces().length).toBeGreaterThanOrEqual(2);
  });

  /**
   * `verify-publish-exports.mjs` is N/A for this package and always will be
   * while it is private: it skips a manifest with no `publishConfig` swap.
   * Pinned here so the exemption is a fact somebody checked rather than an
   * omission nobody noticed.
   */
  it('is exempt from the publish-exports guard for a reason that still holds', () => {
    expect(manifest.publishConfig).toBeUndefined();
    expect(manifest.scripts).not.toHaveProperty('build');
  });

  it('points every subpath at a file that exists under src/', () => {
    const broken = Object.entries(exportsMap()).flatMap(([subpath, target]) => {
      if (!target.startsWith('./src/')) {
        return [`${subpath} → ${target} is outside src/`];
      }
      return existsSync(join(packageRoot, target))
        ? []
        : [`${subpath} → ${target} does not exist`];
    });

    expect(broken).toEqual([]);
  });

  /**
   * And the other direction: a module a consumer imports through a subpath the
   * map does not declare.
   *
   * This is the failure the map's hand-written 60 entries invite — a family
   * adds a component, a host imports it, and it works locally through whatever
   * resolution the consumer's bundler happens to allow while `exports` says
   * the subpath does not exist.
   */
  it('declares every subpath a consuming workspace imports', () => {
    const declared = exportsMap();
    const used = specifiersInConsumers();

    // A walk that found nothing would report no undeclared subpaths and pass.
    expect(used.length).toBeGreaterThan(0);

    const undeclared = used
      .filter(({ subpath }) => declared[subpath] === undefined)
      .map(({ subpath, file }) => `${subpath} (${file})`);

    expect([...new Set(undeclared)]).toEqual([]);
  });
});
