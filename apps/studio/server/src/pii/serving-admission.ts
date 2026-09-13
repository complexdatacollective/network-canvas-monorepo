import type pg from 'pg';

import { assertSamePostgresDatabase } from '@codaco/studio-sync/postgres-database-identity';
import { assertSafePostgresRuntimeIdentity } from '@codaco/studio-sync/postgres-runtime-identity';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';

import { checkSchema } from '../db/schema.ts';
import { withProbeClient } from '../observability/bounded-probe.ts';
import {
  EncryptionStartupError,
  verifyEncryptionKeyTransaction,
} from './initialize.ts';
import {
  loadEncryptionKeys,
  type EncryptionKeys,
  type RootKeyLoader,
} from './keys.ts';

export class DatabaseRuntimeAdmissionError extends Error {
  constructor() {
    super('Studio database runtime admission failed.');
    this.name = 'DatabaseRuntimeAdmissionError';
  }
}

/** Keep the actual app and maintenance sockets admitted until key proofs commit.
 * The key loader runs first, so a provider wait cannot hold database transactions. */
export async function initializeServingEncryption(options: {
  pool?: pg.Pool;
  maintenancePool: pg.Pool;
  configuration: unknown;
  loadRootKey: RootKeyLoader;
  allowUnversioned?: boolean;
  allowedLogins?: readonly string[];
  administrativeLogins?: readonly string[];
}): Promise<EncryptionKeys> {
  const allowedLogins = [...(options.allowedLogins ?? [])];
  const administrativeLogins = [...(options.administrativeLogins ?? [])];
  const keys = await loadEncryptionKeys(
    options.configuration,
    options.loadRootKey,
  );
  const signal = AbortSignal.timeout(10_000);
  const policy = {
    allowedLogins,
    administrativeLogins,
    allowUnversioned: options.allowUnversioned,
  };
  const admit = async (
    client: pg.PoolClient,
    role: typeof TENANT_ROLES.app | typeof TENANT_ROLES.maintenance,
  ) => {
    if (!options.allowUnversioned)
      await assertSafePostgresRuntimeIdentity(client, {
        intendedRole: role,
        allowedRoles: [role],
        runtimeRoleSets: [[TENANT_ROLES.app], [TENANT_ROLES.maintenance]],
        backupRole: BACKUP_ROLE,
        allowedLogins,
        administrativeLogins,
      });
    if ((await checkSchema(client, policy)).kind !== 'current')
      throw new DatabaseRuntimeAdmissionError();
  };
  try {
    await withProbeClient(
      options.maintenancePool,
      signal,
      async (maintenance) => {
        try {
          await maintenance.query('BEGIN');
          await admit(maintenance, TENANT_ROLES.maintenance);
          const verify = async () => {
            try {
              await verifyEncryptionKeyTransaction(maintenance, keys, false);
            } catch {
              throw new EncryptionStartupError();
            }
            signal.throwIfAborted();
            await maintenance.query('COMMIT');
          };
          if (options.pool) {
            await withProbeClient(options.pool, signal, async (app) => {
              try {
                await app.query('BEGIN READ ONLY');
                await admit(app, TENANT_ROLES.app);
                await assertSamePostgresDatabase(app, maintenance);
                await verify();
              } finally {
                await app.query('ROLLBACK');
              }
            });
          } else await verify();
        } finally {
          await maintenance.query('ROLLBACK');
        }
      },
    );
  } catch (error) {
    if (error instanceof EncryptionStartupError) throw error;
    throw new DatabaseRuntimeAdmissionError();
  }
  return keys;
}
