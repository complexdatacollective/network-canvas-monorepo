import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';

/* oxlint-disable-next-line node/no-process-env -- the boundary for this flag */
const CI = process.env.CI === 'true';

/**
 * The scratch-schema DDL, byte-for-byte what `scripts/apply.ts` renders.
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
 * Whoever renders first checks the result against `SCHEMA_FINGERPRINT` — the
 * committed sha256 of exactly these bytes, the same equality `applySchema`
 * asserts before it pushes — so a tree whose schema has moved without
 * `sync-fingerprint` fails with the message that names the fix rather than
 * provisioning something the fingerprint does not describe. That check is new
 * to this path: `provisionScratchSchema` used to stamp the fingerprint
 * without confirming the DDL it had just executed hashed to it.
 *
 * On CI the rendered bytes are then shared between workers through a file
 * addressed by that fingerprint, and the guarantee is exact: **the entry can
 * only ever hold bytes that a process in this same run rendered from live
 * source and verified.** CI caches the pnpm store rather than `node_modules`,
 * so the directory is always empty when a run starts — the workers that miss
 * together each render once, and every file after that reads the entry.
 *
 * That guarantee is what the CI condition protects, so it is not a flag for
 * turning an optimisation on and off. Off CI the directory survives, and it
 * would survive a schema edit too: `SCHEMA_FINGERPRINT` does not change until
 * `sync-fingerprint` runs, so a stale entry would still hash to it and a
 * local run would provision the schema the developer had just stopped using.
 * Reading live source is the only thing that catches that, so off CI this
 * renders every time, exactly as the suite did before the cache existed.
 */
let cached: Promise<string> | undefined;

export function scratchSchemaDdl(): Promise<string> {
  // A rejection must not become the memoised answer. Every later caller in
  // this worker would replay the one failure instead of retrying, so a file
  // that provisions per test would report the same stale error once per test
  // and bury which one actually failed.
  cached ??= load().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

function cachePath(): string {
  // Beside the package's other build caches, so `node_modules` removal clears
  // it and no cleanup step has to know about it.
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

  if (CI) {
    try {
      const hit = await readFile(path, 'utf8');
      if (fingerprintOf(hit) === SCHEMA_FINGERPRINT) return hit;
    } catch {
      // A miss and an unreadable entry are the same thing: render it.
    }
  }

  // Deferred so a cache hit never pays for drizzle-kit's module graph.
  const { renderSchemaStatements } = await import('../../../scripts/apply.ts');
  const sql = (await renderSchemaStatements()).join('\n');

  if (fingerprintOf(sql) !== SCHEMA_FINGERPRINT) {
    throw new Error(
      'src/db/fingerprint.generated.ts does not match the schema definitions; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    );
  }

  if (CI) {
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
  }

  return sql;
}
