import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../..',
);

const SCANNED_ROOTS = [
  'apps/studio/api/src',
  'apps/studio/api/scripts',
  'packages/studio-sync/src',
];

const SERVER_MANIFEST = 'apps/studio/api/package.json';

const ENQUEUE_MODULE = 'apps/studio/api/src/jobs/insert.ts';

const WORKER_MODULE = 'apps/studio/api/src/jobs/worker.ts';

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

function scannedFiles(): { path: string; source: string }[] {
  return SCANNED_ROOTS.flatMap((root) =>
    typescriptFiles(resolve(REPO_ROOT, root)).map((path) => ({
      path: relative(REPO_ROOT, path),
      source: readFileSync(path, 'utf8'),
    })),
  );
}

function importsPgBoss(source: string): boolean {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].some(
    ([, specifier]) => specifier === 'pg-boss',
  );
}

const INSERTS_A_JOB = /INSERT\s+INTO[\s\S]{0,60}\.jobs\b/i;

const Manifest = Schema.Struct({
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String),
  ),
  peerDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String),
  ),
});

describe('job source policy', () => {
  it('has no pg-boss left to import', () => {
    const importers = scannedFiles()
      .filter(({ source }) => importsPgBoss(source))
      .map(({ path }) => path)
      .toSorted();

    expect(importers).toEqual([]);

    const manifest = Schema.decodeUnknownSync(Manifest)(
      JSON.parse(readFileSync(resolve(REPO_ROOT, SERVER_MANIFEST), 'utf8')),
    );
    expect(
      Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      }),
    ).not.toContain('pg-boss');
  });

  it('creates a job in the two modules a transaction reaches', () => {
    const inserters = scannedFiles()
      .filter(({ path }) => !path.includes('/__tests__/'))
      .filter(({ source }) => INSERTS_A_JOB.test(source))
      .map(({ path }) => path)
      .toSorted();

    expect(inserters).toEqual([ENQUEUE_MODULE, WORKER_MODULE].toSorted());
  });
});
