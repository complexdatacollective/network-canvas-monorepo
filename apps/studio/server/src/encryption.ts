import type pg from 'pg';

import { createMaintenancePool } from './db/pool.ts';
import { readEncryptionEnv, readMigrationDatabase } from './env.ts';
import { logOperational } from './observability/logger.ts';
import { runEncryptionCommand } from './pii/operator.ts';

// A separate image command. No listener, auth, worker, development fallback,
// secret command-line argument or automatic historical-key retirement.
let pool: pg.Pool | undefined;
try {
  const encryption = readEncryptionEnv();
  pool = createMaintenancePool(readMigrationDatabase());
  const result = await runEncryptionCommand(
    process.argv.slice(2),
    pool,
    encryption,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  logOperational('STUDIO_ENCRYPTION_MAINTENANCE_FAILED');
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {
    logOperational('STUDIO_ENCRYPTION_MAINTENANCE_FAILED');
    process.exitCode = 1;
  });
}
