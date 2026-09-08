import type pg from 'pg';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';
import { BACKUP_ROLE } from '@codaco/studio-sync/rls';

import {
  readMigrationAdministrativeLogins,
  readMigrationAllowedLogins,
  readRecoveryAuthorizationEnv,
} from './env.ts';
import { logOperational } from './observability/logger.ts';
import { readStudioRecoveryAuthorizationReconciliation } from './recovery/authorization-reconciliation.ts';
import { reconcileStudioRecoveryAuthorization } from './recovery/authorization.ts';

let pool: pg.Pool | undefined;
let backupPool: pg.Pool | undefined;
try {
  if (process.argv.length !== 2) throw new Error();
  const configuration = readRecoveryAuthorizationEnv();
  const allowedLogins = readMigrationAllowedLogins();
  const administrativeLogins = readMigrationAdministrativeLogins(allowedLogins);
  const evidence = await readStudioRecoveryAuthorizationReconciliation(
    configuration.reconciliationPath,
    configuration.reconciliationSha256,
  );
  pool = createPostgresPool({
    connectionString: configuration.database.url,
    max: 1,
    onIdleError: () => logOperational('STUDIO_RECOVERY_AUTHORIZATION_FAILED'),
    roleMismatchCode: 'STUDIO_DATABASE_ROLE_MISMATCH',
  });
  backupPool = createPostgresPool({
    connectionString: configuration.backupDatabase.url,
    role: BACKUP_ROLE,
    max: 1,
    onIdleError: () => logOperational('STUDIO_RECOVERY_AUTHORIZATION_FAILED'),
    roleMismatchCode: 'STUDIO_DATABASE_ROLE_MISMATCH',
  });
  const receipt = await reconcileStudioRecoveryAuthorization({
    pool,
    backupPool,
    policy: { allowedLogins, administrativeLogins },
    reconciliation: evidence.reconciliation,
    reconciliationSha256: evidence.sha256,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  logOperational('STUDIO_RECOVERY_AUTHORIZATION_RECONCILED');
} catch {
  logOperational('STUDIO_RECOVERY_AUTHORIZATION_FAILED');
  process.exitCode = 1;
} finally {
  await Promise.all([
    pool?.end().catch(() => {
      process.exitCode = 1;
    }),
    backupPool?.end().catch(() => {
      process.exitCode = 1;
    }),
  ]);
}
