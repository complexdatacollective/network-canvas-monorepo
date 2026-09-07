import type pg from 'pg';

import { assertSafePostgresDatabaseEnrollment } from '@codaco/studio-sync/postgres-database-enrollment';

import { assertBackupAccess } from './db/backup.ts';
import { createBackupPool } from './db/pool.ts';
import { checkSchema } from './db/schema.ts';
import { readMigrationAllowedLogins, readMigrationDatabase } from './env.ts';
import { logOperational } from './observability/logger.ts';

// Separate operator process: DATABASE_URL must contain only the dedicated
// backup login. Reuse the minimal URL reader without starting auth or workers.
let pool: pg.Pool | undefined;
try {
  if (process.argv.length !== 2) throw new Error('No arguments are accepted.');
  const allowedLogins = readMigrationAllowedLogins();
  pool = createBackupPool(readMigrationDatabase());
  await assertBackupAccess(pool, (client) =>
    assertSafePostgresDatabaseEnrollment(client, allowedLogins, {
      allowClosedEnrolledLogins: true,
    }),
  );
  if ((await checkSchema(pool)).kind !== 'current') {
    throw new Error('The backup image must match the database schema.');
  }
  process.stdout.write('Studio backup access verified.\n');
} catch {
  logOperational('STUDIO_BACKUP_ACCESS_UNSAFE');
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {
    logOperational('STUDIO_BACKUP_ACCESS_UNSAFE');
    process.exitCode = 1;
  });
}
