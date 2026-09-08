import type pg from 'pg';

import { createMaintenancePool, createOwnerPool } from './db/pool.ts';
import {
  readEncryptionEnv,
  readMigrationAllowedLogins,
  readMigrationAdministrativeLogins,
  readMigrationDatabase,
} from './env.ts';
import { logOperational } from './observability/logger.ts';
import { runEncryptionCommand } from './pii/operator.ts';

// A separate image command. No listener, auth, worker, development fallback,
// secret command-line argument or automatic historical-key retirement.
let pool: pg.Pool | undefined;
let operatorPool: pg.Pool | undefined;
try {
  const encryption = readEncryptionEnv();
  const database = readMigrationDatabase();
  const allowedLogins = readMigrationAllowedLogins();
  const administrativeLogins = readMigrationAdministrativeLogins(allowedLogins);
  pool = createMaintenancePool(database);
  // A database owner or explicitly enrolled offline administrator may inspect
  // its migration evidence through this separate unpinned pool.
  // A restricted maintenance login must retain the ordinary protected identity
  // checks. Establish ownership from the real session, never from URL spelling.
  operatorPool = createOwnerPool(database);
  const identity = await operatorPool.query<{ is_administrator: boolean }>(
    'SELECT session_user = pg_catalog.pg_get_userbyid(datdba) OR session_user = ANY($1::pg_catalog.text[]) AS is_administrator FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()',
    [administrativeLogins],
  );
  const result = await runEncryptionCommand(
    process.argv.slice(2),
    pool,
    encryption,
    {
      allowedLogins,
      administrativeLogins,
      schemaPool:
        identity.rows[0]?.is_administrator === true ? operatorPool : pool,
    },
    operatorPool,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  logOperational('STUDIO_ENCRYPTION_MAINTENANCE_FAILED');
  process.exitCode = 1;
} finally {
  await Promise.all(
    [pool, operatorPool].map(async (ownedPool) => {
      await ownedPool?.end().catch(() => {
        logOperational('STUDIO_ENCRYPTION_MAINTENANCE_FAILED');
        process.exitCode = 1;
      });
    }),
  );
}
