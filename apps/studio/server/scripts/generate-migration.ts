import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateDrizzleJson,
  generateMigration,
  up,
} from 'drizzle-kit/api-postgres';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import {
  jsonHash,
  readMigrations,
  sha256,
  type Migration,
  type MigrationManifest,
} from '../src/db/migrations/artifact.ts';
import { SCHEMA, SIDECARS } from '../src/db/schema.ts';
import { computeSchemaFingerprint } from './apply.ts';

// Authoring only: drizzle-kit stays outside the production bundle/image.
// Historical files are never overwritten. Optional before/after SQL carries
// reviewed data transformations or removal of obsolete sidecar objects.
export async function generateMigrationFiles({
  root,
  name,
  before = '',
  after = '',
}: {
  root: string;
  name: string;
  before?: string;
  after?: string;
}): Promise<{ id: string; statements: number }> {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error('Supply --name using lower_snake_case.');
  const fingerprint = await computeSchemaFingerprint();
  if (fingerprint !== SCHEMA_FINGERPRINT)
    throw new Error('Run sync-fingerprint before generating a migration.');
  await mkdir(root, { recursive: true });
  let prior: Migration[];
  try {
    prior = await readMigrations(root);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'No versioned Studio migrations found.'
    )
      throw error;
    prior = [];
  }
  const previous = prior.at(-1);
  if (previous?.manifest.fingerprint === fingerprint)
    throw new Error(
      'Schema and sidecars are unchanged; no migration to generate. Data transformations must accompany a schema or sidecar change so the boot fingerprint detects unapplied migrations.',
    );
  if (prior.length >= 9999)
    throw new Error('Migration identifier space exhausted.');
  const emptySnapshot = await generateDrizzleJson({});
  // Drizzle's up() handles legacy formats, and assumes their `schemas` field.
  // Current snapshots already contain ddl and must go straight to its diff API.
  // The loader checks this authored artifact's checksum; Drizzle owns its schema.
  const oldSnapshot = previous
    ? previous.snapshot.version === emptySnapshot.version
      ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checksummed Drizzle artifact in the current engine format
        (previous.snapshot as typeof emptySnapshot)
      : up(previous.snapshot).snapshot
    : emptySnapshot;
  const snapshot = await generateDrizzleJson(
    SCHEMA,
    previous ? oldSnapshot.id : undefined,
  );
  // Pinned rc.4 needs the repository patch to expose a noninteractive policy.
  // Never guess a rename: copying existing data belongs in reviewed before/
  // after SQL, especially when a new column changes its storage format.
  const statements = await generateMigration(oldSnapshot, snapshot, {
    renames: 'none',
  });
  const sql =
    [before, statements.join('\n'), after].filter(Boolean).join('\n') + '\n';
  const sidecars = SIDECARS.join('\n') + '\n';
  const id = `${String(prior.length + 1).padStart(4, '0')}_${name}`;
  const manifest: MigrationManifest = {
    format: 1,
    id,
    previous: previous?.manifest.id ?? null,
    fingerprint,
    snapshotHash: jsonHash(snapshot),
    sqlHash: sha256(sql),
    sidecarsHash: sha256(sidecars),
  };
  const output = join(root, id);
  await mkdir(output);
  await Promise.all([
    writeFile(
      join(output, 'snapshot.json'),
      JSON.stringify(snapshot, null, 2) + '\n',
      { flag: 'wx' },
    ),
    writeFile(
      join(output, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx' },
    ),
    writeFile(join(output, 'migration.sql'), sql, { flag: 'wx' }),
    writeFile(join(output, 'sidecars.sql'), sidecars, { flag: 'wx' }),
  ]);
  return { id, statements: statements.length };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (
      !flag ||
      !['--name', '--before', '--after'].includes(flag) ||
      !value ||
      options.has(flag)
    ) {
      throw new Error(
        'Usage: generate-migration --name lower_snake_case [--before file.sql] [--after file.sql]',
      );
    }
    options.set(flag, value);
  }
  const name = options.get('--name') ?? '';
  const readOptional = async (flag: string) =>
    options.has(flag) ? await readFile(options.get(flag)!, 'utf8') : '';
  const result = await generateMigrationFiles({
    root: fileURLToPath(new URL('../migrations', import.meta.url)),
    name,
    before: await readOptional('--before'),
    after: await readOptional('--after'),
  });
  console.log(
    `Generated ${result.id}: ${result.statements} Drizzle statements plus the ordered sidecar snapshot. Review the SQL and run the migration tests before committing.`,
  );
}
