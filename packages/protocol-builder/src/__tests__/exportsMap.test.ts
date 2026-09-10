import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The `exports` maps of both protocol-builder halves, in both directions,
 * because nothing else checks them.
 *
 * `scripts/verify-publish-exports.mjs` — the guard that proves every published
 * package's map resolves into its tarball — skips both: neither has a
 * `publishConfig` swap and both are `private`, so there is no pack step and no
 * `dist/` for it to walk. That is correct, and it leaves hand-written maps with
 * nothing looking at them at all. A subpath pointing at a file that has moved
 * fails only when a consumer imports it, and a module a consumer imports that
 * is NOT in the map fails only in that consumer's build.
 *
 * Both are asked here instead, of each package:
 *
 * - every declared subpath resolves to a file that exists under `src/`, and
 * - every `<package>/…` specifier written anywhere in a workspace that depends
 *   on it names a subpath the map declares.
 *
 * The consumers are discovered from their manifests rather than listed, so a
 * further workspace taking a dependency on either package is scanned the day it
 * does.
 *
 * `@codaco/protocol-builder-core` is covered from here rather than from its own
 * package because the two maps are one surface split in half: #1842 moved the
 * contract out of this package, and the three `./contract*` subpaths that used
 * to be checked by the walk below are now core's. Checking only the half left
 * behind would have made that move silently drop the guard.
 */
const packageRoot = process.cwd();
const repoRoot = join(packageRoot, '..', '..');

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

const exportsMapOf = (
  manifest: Record<string, unknown>,
): Readonly<Record<string, string>> => {
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

/** Every workspace whose manifest takes a dependency on the named package. */
const consumingWorkspaces = (packageName: string): string[] =>
  workspaceDirectories().filter((directory) => {
    const manifestPath = join(directory, 'package.json');
    if (!existsSync(manifestPath)) return false;
    const consumer = readManifest(manifestPath);
    return DEPENDENCY_FIELDS.some((field) => {
      const declared = consumer[field];
      return isRecord(declared) && packageName in declared;
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
 * Every specifier naming a package, in the positions a resolver reads.
 *
 * The import forms rather than any quoted occurrence, and the distinction is
 * not academic: `apps/studio/client/vite.config.ts` lists the package's bare
 * name in `optimizeDeps.exclude`, which is a package to leave unbundled rather
 * than a module to resolve, and a plain string search reports it as an
 * undeclared `.` subpath. The shape mirrors `packageImportBoundaries.test.ts`'s
 * specifier pattern, and catches the CSS `@import` too.
 *
 * `@codaco/protocol-builder` is a prefix of `@codaco/protocol-builder-core`, so
 * the name is followed by an explicit end — a subpath `/` or the closing quote
 * — rather than left open. Without it every core specifier would also be read
 * as a `@codaco/protocol-builder` one, and reported against the wrong map.
 */
const specifierPattern = (packageName: string): RegExp =>
  new RegExp(
    String.raw`(?:from|import|require)\s*\(?\s*['"]${packageName}(/[^'"]*)?['"]`,
    'g',
  );

type Usage = Readonly<{ subpath: string; file: string }>;

const specifiersInConsumers = (packageName: string): Usage[] =>
  consumingWorkspaces(packageName).flatMap((workspace) =>
    sourceFilesUnder(workspace).flatMap((file) => {
      const contents = readFileSync(file, 'utf8');
      return [...contents.matchAll(specifierPattern(packageName))].map(
        (match) => ({
          subpath: match[1] === undefined ? '.' : `.${match[1]}`,
          file,
        }),
      );
    }),
  );

/**
 * The two halves, each with the landmark that proves the walk reached it.
 *
 * `root` is derived from the runner's working directory for this package and
 * from the repository for its sibling; both are checked against the manifest
 * name below, so a package that moved fails here rather than reporting an empty
 * map that passes.
 */
const PACKAGES = [
  {
    name: '@codaco/protocol-builder',
    root: packageRoot,
    // Studio and Architect both depend on it today; the count is a floor, so
    // this stays true as consumers are added.
    consumerFloor: 2,
  },
  {
    name: '@codaco/protocol-builder-core',
    root: join(repoRoot, 'packages', 'protocol-builder-core'),
    // This package, `@codaco/studio-rpc`, Architect and the Studio server take
    // the contract from it today. A floor, for the same reason.
    consumerFloor: 2,
  },
] as const;

describe.each(PACKAGES)(
  '$name exports map',
  ({ name, root, consumerFloor }) => {
    const manifest = readManifest(join(root, 'package.json'));

    /**
     * Every reading below is a file-system walk from a path this file computes,
     * so a package that moved would find no consumers, no specifiers and no
     * defects. Asserted against landmarks each half needs, rather than assumed.
     */
    it('is looking at this package inside this repository', () => {
      expect(manifest.name).toBe(name);
      expect(manifest.private).toBe(true);
      expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
      expect(consumingWorkspaces(name).length).toBeGreaterThanOrEqual(
        consumerFloor,
      );
    });

    /**
     * `verify-publish-exports.mjs` is N/A for these packages and always will be
     * while they are private: it skips a manifest with no `publishConfig` swap.
     * Pinned here so the exemption is a fact somebody checked rather than an
     * omission nobody noticed.
     */
    it('is exempt from the publish-exports guard for a reason that still holds', () => {
      expect(manifest.publishConfig).toBeUndefined();
      expect(manifest.scripts).not.toHaveProperty('build');
    });

    it('points every subpath at a file that exists under src/', () => {
      const declared = exportsMapOf(manifest);

      // A map read as empty would report no broken subpaths and pass.
      expect(Object.keys(declared).length).toBeGreaterThan(0);

      const broken = Object.entries(declared).flatMap(([subpath, target]) => {
        if (!target.startsWith('./src/')) {
          return [`${subpath} → ${target} is outside src/`];
        }
        return existsSync(join(root, target))
          ? []
          : [`${subpath} → ${target} does not exist`];
      });

      expect(broken).toEqual([]);
    });

    /**
     * And the other direction: a module a consumer imports through a subpath the
     * map does not declare.
     *
     * This is the failure a hand-written map invites — a family adds a component,
     * a host imports it, and it works locally through whatever resolution the
     * consumer's bundler happens to allow while `exports` says the subpath does
     * not exist.
     */
    it('declares every subpath a consuming workspace imports', () => {
      const declared = exportsMapOf(manifest);
      const used = specifiersInConsumers(name);

      // A walk that found nothing would report no undeclared subpaths and pass.
      expect(used.length).toBeGreaterThan(0);

      const undeclared = used
        .filter(({ subpath }) => declared[subpath] === undefined)
        .map(({ subpath, file }) => `${subpath} (${file})`);

      expect([...new Set(undeclared)]).toEqual([]);
    });
  },
);
