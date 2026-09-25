// Where a job may be created, and that the queue Studio no longer runs stays
// gone.
//
// The rule the second half serves: a job is created by the transaction that
// caused it. An enqueue on a connection of its own reopens the two windows the
// transactional path closes — a committed change with no job, and a job for a
// change that rolled back — so the statement that creates one lives in the one
// module that renders it and nowhere else.
//
// There used to be a third case here, asserting that the node-postgres twin
// (`src/jobs/client.ts`) never fetched a connection of its own. It is gone
// with the twin: the guarantee is structural now, because `Jobs.enqueue`
// requires `Transaction` and only a scope (`src/db/tenant.ts`) provides one —
// which `src/jobs/__tests__/transaction.test.ts` proves three ways, including
// the type-level half a source scan could never reach.
//
// The rule the first half serves is narrower: pg-boss was removed with the
// native queue (#1957), and a dependency that is gone from the manifest can
// still be reachable through another package's tree. This is what says nothing
// imports it back.
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
  'apps/studio/server/src',
  'apps/studio/server/scripts',
  'packages/studio-sync/src',
];

const SERVER_MANIFEST = 'apps/studio/server/package.json';

/** The one renderer of the statement both enqueue paths send. */
const ENQUEUE_MODULE = 'apps/studio/server/src/jobs/insert.ts';

/** The worker, whose only insert is the dead-letter copy; see below. */
const WORKER_MODULE = 'apps/studio/server/src/jobs/worker.ts';

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

/**
 * An insert into a queue's `jobs` table, however the schema in front of it is
 * interpolated — `${sql(schema)}.jobs`, `${schema}.jobs`, a literal name.
 */
const INSERTS_A_JOB = /INSERT\s+INTO[\s\S]{0,60}\.jobs\b/i;

/** Only the fields this suite reads; a manifest shape change fails here. */
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

    // Not "kept to the job modules" any more: the native queue replaced it
    // whole (#1957), so the only true list is the empty one. A file matched
    // here even by a specifier written inside a comment is a finding rather
    // than a false alarm, since no comment has a reason to write one now.
    expect(importers).toEqual([]);

    const manifest = Schema.decodeUnknownSync(Manifest)(
      JSON.parse(readFileSync(resolve(REPO_ROOT, SERVER_MANIFEST), 'utf8')),
    );
    // And it is not installed, which is what stops an import from being added
    // back without anyone deciding to: a dependency that is present resolves.
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
      // The suites are out of scope, and deliberately: three of them write a
      // row by hand — the payload an older release left, the row a writer
      // other than the enqueue makes `created` — and each of those rows is the
      // fixture the case reads back. None of them is a way a running server
      // creates a job, which is what this rule is about.
      .filter(({ path }) => !path.includes('/__tests__/'))
      .filter(({ source }) => INSERTS_A_JOB.test(source))
      .map(({ path }) => path)
      .toSorted();

    // `insert.ts` renders the statement and `jobs.ts` sends it on the
    // `Transaction` the caller opened. The sender holds no SQL of its own,
    // which is why only the renderer appears here.
    //
    // The worker's is listed rather than filtered out, the way the old suite
    // listed the S3 `send` calls: it is not an enqueue at all but the
    // dead-letter copy of a row already in the table, written inside the same
    // transaction that settles the job it copies. A fourth file appearing here
    // has to be classified in this comment before it can land.
    expect(inserters).toEqual([ENQUEUE_MODULE, WORKER_MODULE].toSorted());
  });
});
