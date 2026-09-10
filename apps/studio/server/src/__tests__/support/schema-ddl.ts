import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';

/**
 * The scratch-schema DDL, byte-for-byte what `scripts/apply.ts` renders, read
 * from a content-addressed cache so the sixty test files that only need the
 * statements never load drizzle-kit.
 *
 * Rendering the statements means importing `drizzle-kit/api-postgres` and
 * diffing an empty catalogue against `SCHEMA`. drizzle-kit is memoised inside
 * a process, but vitest gives each test file its own module registry, so the
 * suite paid that import once per file to obtain a string that never varies
 * within a run. Only three files (`src/__tests__/schema.test.ts`,
 * `src/db/migrations/__tests__/migrate.test.ts`,
 * `src/db/migrations/__tests__/artifact.test.ts`) exercise drizzle-kit's own
 * behaviour and still import it directly.
 *
 * The cache cannot serve the wrong schema. `SCHEMA_FINGERPRINT` is the
 * committed sha256 of exactly these bytes — the same equality `applySchema`
 * asserts before it pushes — so a cache entry is used only when hashing it
 * reproduces the fingerprint the working tree declares. Edit the schema
 * without running `sync-fingerprint` and this misses and re-renders, then the
 * render's own fingerprint check fails with the message that names the fix;
 * edit it and run `sync-fingerprint` and the new fingerprint addresses a new
 * entry. A truncated or half-written file simply misses.
 */
let cached: Promise<string> | undefined;

export function scratchSchemaDdl(): Promise<string> {
  cached ??= load();
  return cached;
}

function cachePath(): string {
  // Beside the package's other build caches, so `node_modules` removal clears
  // it and no cleanup step has to know about it. CI caches the pnpm store
  // rather than `node_modules`, so a CI run always starts cold: the workers
  // that miss together each render once, and every file after that reads the
  // entry. The saving is per file, not per run, so a cold start costs one
  // render and still avoids the other fifty-odd imports.
  return join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../node_modules/.cache/studio-server',
    `scratch-schema-${SCHEMA_FINGERPRINT}.sql`,
  );
}

function fingerprintOf(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

async function load(): Promise<string> {
  const path = cachePath();

  try {
    const hit = await readFile(path, 'utf8');
    if (fingerprintOf(hit) === SCHEMA_FINGERPRINT) return hit;
  } catch {
    // A miss and an unreadable entry are the same thing: render it.
  }

  // Deferred so a cache hit never pays for drizzle-kit's module graph.
  const { renderSchemaStatements } = await import('../../../scripts/apply.ts');
  const sql = (await renderSchemaStatements()).join('\n');

  if (fingerprintOf(sql) !== SCHEMA_FINGERPRINT) {
    throw new Error(
      'src/db/fingerprint.generated.ts does not match the schema definitions; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    );
  }

  // Workers that missed together each render; the rename makes the last one
  // win with identical bytes, and readers never observe a partial file.
  try {
    await mkdir(dirname(path), { recursive: true });
    const pending = `${path}.${process.pid}.pending`;
    await writeFile(pending, sql);
    await rename(pending, path);
  } catch {
    // The cache is an optimisation; failing to write one is not a test
    // failure, and the statements in hand are already verified.
  }

  return sql;
}
