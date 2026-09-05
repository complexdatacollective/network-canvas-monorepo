import { fileURLToPath } from 'node:url';

import { SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { readMigrations } from './db/migrations/artifact.ts';
import { migrateDatabase } from './db/migrations/migrate.ts';
import { createOwnerPool } from './db/pool.ts';
import { readMigrationDatabase } from './env.ts';

// Vite bundles this as dist/migrate.js; the image carries migrations beside
// dist. It is never imported by the web server's startup path.
if (process.argv.length > 2) throw new Error('Usage: migrate (no arguments)');
const migrations = await readMigrations(
  fileURLToPath(new URL('../migrations', import.meta.url)),
);
const pool = createOwnerPool(readMigrationDatabase());
try {
  const completed = await migrateDatabase(pool, migrations, SCHEMA_FINGERPRINT);
  // oxlint-disable-next-line no-console -- explicit operator command
  console.log(
    completed.length
      ? `Applied Studio migrations: ${completed.join(', ')}`
      : 'Studio migrations already current.',
  );
} finally {
  await pool.end();
}
