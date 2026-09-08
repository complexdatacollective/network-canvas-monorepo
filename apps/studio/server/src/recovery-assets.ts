import type pg from 'pg';

import { createAssetStore } from './assets.ts';
import { createBackupPool } from './db/pool.ts';
import {
  readAssetStorage,
  readMigrationAdministrativeLogins,
  readMigrationAllowedLogins,
  readMigrationDatabase,
} from './env.ts';
import { logOperational } from './observability/logger.ts';
import { verifyRecoveredAssets } from './recovery/assets.ts';

let pool: pg.Pool | undefined;
try {
  if (process.argv.length !== 2) throw new Error('No arguments are accepted.');
  const allowedLogins = readMigrationAllowedLogins();
  const administrativeLogins = readMigrationAdministrativeLogins(allowedLogins);
  pool = createBackupPool(readMigrationDatabase());
  const count = await verifyRecoveredAssets(
    pool,
    createAssetStore(readAssetStorage()),
    {
      allowedLogins,
      administrativeLogins,
    },
  );
  process.stdout.write(`Studio recovered assets verified (${count}).\n`);
} catch {
  logOperational('STUDIO_RECOVERED_ASSET_VERIFICATION_FAILED');
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {
    logOperational('STUDIO_RECOVERED_ASSET_VERIFICATION_FAILED');
    process.exitCode = 1;
  });
}
