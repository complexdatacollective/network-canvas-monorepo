import { fileURLToPath } from 'node:url';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { migrateDatabase } from './db/migrations/migrate.ts';
import { createOwnerPool } from './db/pool.ts';
import {
  readMigrationAllowedLogins,
  readMigrationAdministrativeLogins,
  readMigrationDatabase,
} from './env.ts';

// Vite bundles this as dist/migrate.js; the image carries migrations beside
// dist. It is never imported by the web server's startup path.
if (process.argv.length > 2) throw new Error('Usage: migrate (no arguments)');
const migrations = await readMigrations(
  fileURLToPath(new URL('../migrations', import.meta.url)),
);
const allowedLogins = readMigrationAllowedLogins();
const administrativeLogins = readMigrationAdministrativeLogins(allowedLogins);
const pool = createOwnerPool(readMigrationDatabase());
try {
  const admission = await pool.query<{ permitted: boolean }>(
    `SELECT current_user = session_user AND (
       session_user = pg_catalog.pg_get_userbyid(database.datdba)
       OR session_user = ANY($1::pg_catalog.text[])
     ) AS permitted FROM pg_catalog.pg_database database
     WHERE database.datname = pg_catalog.current_database()`,
    [administrativeLogins],
  );
  if (admission.rows[0]?.permitted !== true)
    throw new Error(
      'A distinct Studio migration operator must be explicitly enrolled in STUDIO_DATABASE_ADMINISTRATIVE_LOGINS.',
    );
  const completed = await migrateDatabase(
    pool,
    migrations,
    SCHEMA_FINGERPRINT,
    allowedLogins,
  );
  const message = completed.length
    ? `Applied Studio migrations: ${completed.join(', ')}`
    : 'Studio migrations already current.';
  process.stdout.write(`${message}\n`);
} finally {
  await pool.end();
}
