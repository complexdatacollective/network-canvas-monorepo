import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  generateDrizzleJson,
  generateMigration,
  up,
} from 'drizzle-kit/api-postgres';

import {
  jsonHash,
  readMigrations,
  sha256,
  type Migration,
  type MigrationManifest,
} from './postgres-migration-artifacts.ts';

/** Tooling entry point only. Applications never import this into a runtime. */
export async function renderPostgresSchemaStatements(
  schema: Parameters<typeof generateDrizzleJson>[0],
): Promise<string[]> {
  return generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson(schema),
  );
}

export function fingerprintPostgresSchema(
  statements: readonly string[],
  sidecars: readonly string[],
): string {
  return sha256([...statements, ...sidecars].join('\n'));
}

export async function readMigrationAuthoringOptions(
  arguments_: readonly string[],
) {
  const args = [...arguments_];
  const options = new Map<string, string>();
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (
      !flag ||
      !['--name', '--before', '--after'].includes(flag) ||
      !value ||
      options.has(flag)
    )
      throw new Error(
        'Usage: generate-migration --name lower_snake_case [--before file.sql] [--after file.sql]',
      );
    options.set(flag, value);
  }
  const readOptional = async (flag: string) => {
    const path = options.get(flag);
    return path === undefined ? '' : readFile(path, 'utf8');
  };
  return {
    name: options.get('--name') ?? '',
    before: await readOptional('--before'),
    after: await readOptional('--after'),
  };
}

// Authoring only: drizzle-kit stays outside the production bundle/image.
// Historical files are never overwritten. Optional before/after SQL carries
// reviewed data transformations or removal of obsolete sidecar objects.
export async function generatePostgresMigrationFiles({
  applicationName = 'Studio',
  schema,
  sidecarStatements,
  expectedFingerprint,
  root,
  name,
  before = '',
  after = '',
}: {
  applicationName?: string;
  schema: Parameters<typeof generateDrizzleJson>[0];
  sidecarStatements: readonly string[];
  expectedFingerprint: string;
  root: string;
  name: string;
  before?: string;
  after?: string;
}): Promise<{ id: string; statements: number }> {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error('Supply --name using lower_snake_case.');
  const fingerprint = fingerprintPostgresSchema(
    await renderPostgresSchemaStatements(schema),
    sidecarStatements,
  );
  if (fingerprint !== expectedFingerprint)
    throw new Error('Run sync-fingerprint before generating a migration.');
  await mkdir(root, { recursive: true });
  let prior: Migration[];
  try {
    prior = await readMigrations(root, applicationName);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== `No versioned ${applicationName} migrations found.`
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
    schema,
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
  const sidecars = sidecarStatements.join('\n') + '\n';
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
