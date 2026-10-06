import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import {
  decodeManifest,
  type DocumentMigration,
  EXECUTED_ARTEFACTS,
  MIGRATION_VERSION,
  type MigrationsDocument,
  sha256,
  SNAPSHOT_ARTEFACT,
  verifyMigrations,
} from '../src/db/migrations-document.ts';

// Renders the numbered migrations under `migrations/` into
// `dist/migrations.json`, which is what `studio-api migrate` executes (#1901).
// Run from the `build` script AFTER `vite build`, which empties `dist`.
//
// It refuses the build — and so the image — when the fingerprint is stale,
// when any directory does not re-hash to its manifest, when the ordinals are
// not contiguous, or when the newest migration's fingerprint is not this
// build's: a schema change with no migration fails here, not in production.

export const MIGRATIONS_DIR = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

/** Files a migration directory may hold besides its artefacts. */
const BESIDE_ARTEFACTS = new Set(['manifest.json', 'NOTES.md']);

export class MigrationsUnreadable extends Error {}

function readMigration(dir: string, version: string): DocumentMigration {
  const path = join(dir, version);
  const files = readdirSync(path);
  const known = new Set<string>([
    ...EXECUTED_ARTEFACTS,
    SNAPSHOT_ARTEFACT,
    ...BESIDE_ARTEFACTS,
  ]);
  const stray = files.filter((file) => !known.has(file));
  if (stray.length > 0) {
    throw new MigrationsUnreadable(
      `migrations/${version} holds files no migration carries: ${stray.join(', ')}.`,
    );
  }
  if (!files.includes('manifest.json')) {
    throw new MigrationsUnreadable(
      `migrations/${version} is not sealed (no manifest.json). Run: pnpm --filter @codaco/studio-api migrate:generate --seal`,
    );
  }
  const manifest = decodeManifest(
    readFileSync(join(path, 'manifest.json'), 'utf8'),
  );

  // The snapshot is never shipped, so its hash is checked here, at build
  // time; everything shipped is re-checked by `verifyMigrations` in the image.
  const snapshot = files.includes(SNAPSHOT_ARTEFACT)
    ? sha256(readFileSync(join(path, SNAPSHOT_ARTEFACT), 'utf8'))
    : undefined;
  if (snapshot !== manifest.artefacts[SNAPSHOT_ARTEFACT]) {
    throw new MigrationsUnreadable(
      `migrations/${version}/${SNAPSHOT_ARTEFACT} does not hash to its manifest: the file is damaged or was edited.`,
    );
  }

  return {
    version,
    ordinal: Number(MIGRATION_VERSION.exec(version)?.[1]),
    artefacts: EXECUTED_ARTEFACTS.filter((name) => files.includes(name)).map(
      (name) => ({ name, sql: readFileSync(join(path, name), 'utf8') }),
    ),
    manifest,
  };
}

/**
 * The committed directory as the document the image carries, verified against
 * `fingerprint`. Shared with the test suites (`support/migrations.ts`), so
 * what they migrate is exactly what a build ships. No drizzle-kit here.
 */
export function readMigrationsDocument(
  dir: string = MIGRATIONS_DIR,
  fingerprint: string = SCHEMA_FINGERPRINT,
): MigrationsDocument {
  const versions = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter(
          (entry) => entry.isDirectory() && MIGRATION_VERSION.test(entry.name),
        )
        .map((entry) => entry.name)
        .toSorted()
    : [];
  const document: MigrationsDocument = {
    fingerprint,
    migrations: versions.map((version) => readMigration(dir, version)),
  };
  verifyMigrations(document, fingerprint);
  return document;
}

if (import.meta.main) {
  // Deferred: the image build needs drizzle-kit for this one check, and the
  // suites that read the directory through `readMigrationsDocument` do not.
  const { computeSchemaFingerprint } = await import('./apply.ts');
  if ((await computeSchemaFingerprint()) !== SCHEMA_FINGERPRINT) {
    console.error(
      'src/db/fingerprint.generated.ts does not match the schema definitions; run: pnpm --filter @codaco/studio-api sync-fingerprint',
    );
    process.exit(1);
  }
  let document: MigrationsDocument;
  try {
    document = readMigrationsDocument();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const target = new URL('../dist/migrations.json', import.meta.url);
  await writeFile(target, JSON.stringify(document));
  // oxlint-disable-next-line no-console -- build output
  console.log(
    `Rendered ${document.migrations.length} migration(s) to dist/migrations.json (newest ${document.migrations.at(-1)?.version}, ${SCHEMA_FINGERPRINT.slice(0, 12)}).`,
  );
  // drizzle-kit's esbuild service keeps the loop alive.
  process.exit(0);
}
