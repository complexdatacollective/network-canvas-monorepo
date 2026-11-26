import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Whether an edge type is directed, and which node types it connects, is read
 * only through the helpers in `utils/edgeTypeRules.ts`, so the meaning of an
 * absent setting is decided in one place. This guard scans every workspace's
 * source for a read of `directed` or `endpointRules` and fails for any file
 * outside the allow-list: the helpers, the schema definition that declares the
 * fields, the codebook check that validates them, and the migration. Later
 * work adds only the files that write them.
 */
const repoRoot = join(process.cwd(), '..', '..');

const ALLOWED_FILES = new Set([
  'packages/protocol-validation/src/utils/edgeTypeRules.ts',
  'packages/protocol-validation/src/schemas/9/codebook/definitions.ts',
  'packages/protocol-validation/src/schemas/9/codebook/codebook.ts',
  'packages/protocol-validation/src/schemas/9/migration.ts',
]);

const EXCLUDED_WORKSPACES = new Set([
  'apps/architect-classic',
  'apps/interviewer-classic',
  // The vendored schema 8 Fresco, kept as it shipped.
  'apps/fresco/schema-8',
]);

/** Directories a scan must not walk into: output, caches and installed code. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'test-results',
  'playwright-report',
  '.turbo',
  '.next',
  '.source',
  '.netlify',
  '.wrangler',
  '.output',
  '.git',
  '__tests__',
  '__mocks__',
]);

const isTestFile = (name: string) => /\.(test|spec)\.tsx?$/.test(name);
const isSourceFile = (name: string) =>
  /\.tsx?$/.test(name) && !name.endsWith('.d.ts') && !isTestFile(name);

const FIELD_READ =
  /\.(?:directed|endpointRules)\b|\[\s*['"`](?:directed|endpointRules)['"`]\s*\]/;

const toRepoPath = (path: string) =>
  relative(repoRoot, path).split(sep).join('/');

/** The workspace roots `pnpm-workspace.yaml` names, as globs and as folders. */
const workspaceRoots = () => {
  const contents = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const packagesBlock = contents.split(/^\S/m)[1] ?? '';
  const globs = [...packagesBlock.matchAll(/^ {2}- (.+)$/gm)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1].trim()]),
  );
  return globs.map((glob) => {
    if (!glob.endsWith('/*'))
      return { glob, directories: [join(repoRoot, glob)] };
    const parent = join(repoRoot, glob.slice(0, -2));
    const directories = existsSync(parent)
      ? readdirSync(parent, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name),
          )
          .map((entry) => join(parent, entry.name))
      : [];
    return { glob, directories };
  });
};

const sourceFilesUnder = (directory: string): string[] => {
  if (EXCLUDED_WORKSPACES.has(toRepoPath(directory))) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFilesUnder(path);
    }
    return entry.isFile() && isSourceFile(entry.name) ? [path] : [];
  });
};

const roots = workspaceRoots();
const scanned = new Map(
  roots.map(({ glob, directories }) => [
    glob,
    [...new Set(directories.flatMap(sourceFilesUnder))],
  ]),
);

describe('edge type field readers', () => {
  it('scans every workspace root', () => {
    expect([...scanned.keys()]).toEqual(
      expect.arrayContaining([
        'apps/*',
        'apps/studio/*',
        'packages/*',
        'workers/*',
      ]),
    );
    for (const [glob, files] of scanned) {
      expect({ glob, scanned: files.length > 0 }).toEqual({
        glob,
        scanned: true,
      });
    }
  });

  it('reaches Fresco, Studio and the protocol review Worker', () => {
    const all = new Set([...scanned.values()].flat().map(toRepoPath));
    for (const prefix of [
      'apps/fresco/lib/',
      'apps/studio/api/src/',
      'apps/studio/web/src/',
      'workers/protocol-review/',
      'packages/interview/src/',
    ]) {
      expect({
        prefix,
        seen: [...all].some((path) => path.startsWith(prefix)),
      }).toEqual({ prefix, seen: true });
    }
  });

  it('reads directed and endpointRules only through the edge type helpers', () => {
    const readers = [...new Set([...scanned.values()].flat())]
      .filter((path) => FIELD_READ.test(readFileSync(path, 'utf8')))
      .map(toRepoPath)
      .filter((path) => !ALLOWED_FILES.has(path));
    expect(readers).toEqual([]);
  });
});
