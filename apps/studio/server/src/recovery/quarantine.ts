import type pg from 'pg';

import {
  assertPostgresRecoveryQuarantine,
  type PostgresRecoveryTransaction,
} from '@codaco/studio-sync/postgres-recovery-quarantine';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

const FAILURE = 'STUDIO_RECOVERY_QUARANTINE_REQUIRED';

export type StudioRecoveryTransaction = PostgresRecoveryTransaction;

/** Prove that an offline recovery transaction is the only writer-capable
 * client on the restored target. Administrative clients on other databases
 * remain available for recovery operations. */
export async function assertStudioRecoveryQuarantine(
  client: pg.PoolClient,
  observer: pg.PoolClient,
  options: {
    allowedLogins: readonly string[];
    administrativeLogins: readonly string[];
    allowedClientPids?: readonly number[];
    transaction: StudioRecoveryTransaction;
  },
): Promise<void> {
  try {
    await assertPostgresRecoveryQuarantine(client, observer, {
      runtimeRoles: Object.values(TENANT_ROLES),
      ...options,
    });
  } catch {
    throw new Error(FAILURE);
  }
}
