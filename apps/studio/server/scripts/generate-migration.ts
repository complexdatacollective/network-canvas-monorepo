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
const name = options.get('--name');
if (!name || !/^[a-z][a-z0-9_]*$/.test(name))
  throw new Error('Supply --name using lower_snake_case.');
const fingerprint = await computeSchemaFingerprint();
if (fingerprint !== SCHEMA_FINGERPRINT)
  throw new Error('Run sync-fingerprint before generating a migration.');
const root = fileURLToPath(new URL('../migrations', import.meta.url));
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
const oldSnapshot = previous
  ? up(previous.snapshot).snapshot
  : await generateDrizzleJson({});
const snapshot = await generateDrizzleJson(
  SCHEMA,
  previous ? oldSnapshot.id : undefined,
);
const statements = await generateMigration(oldSnapshot, snapshot);
const readOptional = async (flag: string) =>
  options.has(flag) ? await readFile(options.get(flag)!, 'utf8') : '';
const before = await readOptional('--before');
const after = await readOptional('--after');
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
console.log(
  `Generated ${id}: ${statements.length} Drizzle statements plus the ordered sidecar snapshot. Review the SQL and run the migration tests before committing.`,
);
