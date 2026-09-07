import type pg from 'pg';

import { assertSamePostgresDatabase } from '@codaco/studio-sync/postgres-database-identity';
import { assertSafePostgresRuntimeIdentity } from '@codaco/studio-sync/postgres-runtime-identity';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { AssetStore } from '../assets.ts';
import { checkSchema, type SchemaState } from '../db/schema.ts';
import { verifyEncryptionReadiness } from '../pii/initialize.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import { BoundedProbe, withProbeClient } from './bounded-probe.ts';

export function createReadiness(options: {
  pool?: pg.Pool;
  maintenancePool?: pg.Pool;
  encryptionKeys?: EncryptionKeys;
  assetStore?: AssetStore;
  timeoutMs?: number;
  cacheMs?: number;
  allowUnversionedSchema?: boolean;
  allowedLogins?: readonly string[];
  administrativeLogins?: readonly string[];
}) {
  const {
    pool,
    maintenancePool,
    assetStore,
    timeoutMs,
    cacheMs,
    allowUnversionedSchema,
  } = options;
  const allowedLogins = options.allowedLogins ? [...options.allowedLogins] : [];
  const administrativeLogins = options.administrativeLogins
    ? [...options.administrativeLogins]
    : [];
  const runtimeRoleSets = [
    [TENANT_ROLES.app],
    [TENANT_ROLES.maintenance],
  ] as const;
  const database = new BoundedProbe<SchemaState>(
    pool
      ? (signal) =>
          withProbeClient(pool, signal, async (client) => {
            try {
              await client.query('BEGIN READ ONLY');

              if (!allowUnversionedSchema)
                await assertSafePostgresRuntimeIdentity(client, {
                  intendedRole: TENANT_ROLES.app,
                  allowedRoles: [TENANT_ROLES.app],
                  runtimeRoleSets,
                  backupRole: BACKUP_ROLE,
                  allowedLogins,
                  administrativeLogins,
                });
              const state = await checkSchema(client, {
                allowUnversioned: allowUnversionedSchema,
                allowedLogins,
                administrativeLogins,
              });
              if (maintenancePool) {
                await withProbeClient(
                  maintenancePool,
                  signal,
                  async (maintenance) => {
                    try {
                      await maintenance.query('BEGIN READ ONLY');
                      if (!allowUnversionedSchema)
                        await assertSafePostgresRuntimeIdentity(maintenance, {
                          intendedRole: TENANT_ROLES.maintenance,
                          allowedRoles: [TENANT_ROLES.maintenance],
                          runtimeRoleSets,
                          backupRole: BACKUP_ROLE,
                          allowedLogins,
                          administrativeLogins,
                        });
                      await assertSamePostgresDatabase(client, maintenance);
                      if (options.encryptionKeys)
                        await verifyEncryptionReadiness(
                          maintenance,
                          options.encryptionKeys,
                        );
                    } finally {
                      await maintenance.query('ROLLBACK');
                    }
                  },
                );
              }
              return state;
            } finally {
              await client.query('ROLLBACK');
            }
          })
      : undefined,
    timeoutMs,
    cacheMs,
  );
  const objectStore = new BoundedProbe(
    assetStore ? (signal) => assetStore.checkHealth(signal) : undefined,
    timeoutMs,
    cacheMs,
  );
  return {
    async check() {
      const [db, storage] = await Promise.all([
        database.check(),
        objectStore.check(),
      ]);
      const checks = {
        database: db.status,
        object_store: storage.status,
        schema: db.status === 'ok' ? db.value.kind : db.status,
      };
      const ready =
        checks.database === 'ok' &&
        checks.object_store === 'ok' &&
        checks.schema === 'current';
      return {
        status: ready ? ('ready' as const) : ('not_ready' as const),
        checks,
      };
    },
    stop() {
      database.stop();
      objectStore.stop();
    },
  };
}
