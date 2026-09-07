import type pg from 'pg';

import { createMaintenancePool, createOwnerPool } from './db/pool.ts';
import { readEncryptionEnv, readMigrationDatabase } from './env.ts';
import { logOperational } from './observability/logger.ts';
import { runEncryptionCommand } from './pii/operator.ts';

// A separate image command. No listener, auth, worker, development fallback,
// secret command-line argument or automatic historical-key retirement.
let pool: pg.Pool | undefined;
let operatorPool: pg.Pool | undefined;
try {
  const encryption = readEncryptionEnv();
  const database = readMigrationDatabase();
  pool = createMaintenancePool(database);
  // Lazy and used only by migrate-legacy. Its own login must have direct
  // retained-column access; runtime role memberships cannot supply it.
  operatorPool = createOwnerPool(database);
  const result = await runEncryptionCommand(
    process.argv.slice(2),
    pool,
    encryption,
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
