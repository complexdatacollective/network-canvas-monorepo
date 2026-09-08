import { parseArgs } from 'node:util';

import { createOwnerPool } from '../src/db/pool.ts';
import { readEncryptionEnv, readEnv } from '../src/env.ts';
import { loadEncryptionKeys } from '../src/pii/keys.ts';
import { resetSchemaAndSeed } from './apply.ts';
import { loadEnvFiles } from './load-env-files.ts';
import { confirmDestructiveTarget } from './target-guard.ts';

// It drops the schema rather than the database — unlike packages/studio-sync's
// test helper — so it needs no second connection to the maintenance database
// and no privilege to drop a database that has connections open. The same
// command therefore works against a managed Postgres.

const { values } = parseArgs({
  options: { force: { type: 'boolean', default: false } },
});

loadEnvFiles();

const env = readEnv();
const { db, target } = confirmDestructiveTarget(env, values.force, 'reset');
const encryption = readEncryptionEnv(env);
const encryptionKeys = await loadEncryptionKeys(
  encryption.configuration,
  encryption.loadRootKey,
);

console.log(`Resetting ${target}`);

const pool = createOwnerPool(db);

try {
  await resetSchemaAndSeed(pool, {
    adminPassword: env.seedAdminPassword,
    encryptionKeys,
    sweepScratch: true,
  });
  console.log('Database reset.');
} finally {
  await pool.end();
}
