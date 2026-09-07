import type pg from 'pg';

import { assertBackupAccess } from './db/backup.ts';
import { createBackupPool } from './db/pool.ts';
import { checkSchema } from './db/schema.ts';
import {
  readMigrationAdministrativeLogins,
  readMigrationAllowedLogins,
  readMigrationDatabase,
} from './env.ts';
import { logOperational } from './observability/logger.ts';

// Separate operator process: DATABASE_URL must contain only the dedicated
// backup login. Reuse the minimal URL reader without starting auth or workers.
let pool: pg.Pool | undefined;
try {
  if (process.argv.length !== 2) throw new Error('No arguments are accepted.');
  const allowedLogins = readMigrationAllowedLogins();
  const administrativeLogins = readMigrationAdministrativeLogins(allowedLogins);
  pool = createBackupPool(readMigrationDatabase());
  await assertBackupAccess(pool, async (client) => {
    // The verifier has established this actual backup identity is read-only.
    // Keep complete enrollment, capabilities and schema checks on its bounded
    // transaction while all writer LOGINs remain quarantined.
    const state = await checkSchema(
      client,
      { allowedLogins, administrativeLogins },
      {
        allowClosedEnrolledLogins: true,
      },
    );
    if (state.kind !== 'current')
      throw new Error('The backup image must match the database schema.');
  });
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
