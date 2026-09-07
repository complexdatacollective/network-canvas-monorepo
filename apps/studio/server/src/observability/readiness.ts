import type pg from 'pg';

import { assertSafePostgresRuntimeIdentity } from '@codaco/studio-sync/postgres-runtime-identity';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { AssetStore } from '../assets.ts';
import { checkSchema, type SchemaState } from '../db/schema.ts';
import { BoundedProbe, withProbeClient } from './bounded-probe.ts';

export function createReadiness(options: {
  pool?: pg.Pool;
  maintenancePool?: pg.Pool;
  assetStore?: AssetStore;
  timeoutMs?: number;
  cacheMs?: number;
  allowUnversionedSchema?: boolean;
  allowedLogins?: readonly string[];
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
  const database = new BoundedProbe<SchemaState>(
    pool
      ? (signal) =>
          withProbeClient(pool, signal, async (client) => {
            await client.query('SELECT 1');
            if (!allowUnversionedSchema)
              await assertSafePostgresRuntimeIdentity(client, {
                intendedRole: TENANT_ROLES.app,
                allowedRoles: Object.values(TENANT_ROLES),
                allowedLogins,
              });
            const state = await checkSchema(client, {
              allowUnversioned: allowUnversionedSchema,
              allowedLogins,
            });
            if (!allowUnversionedSchema && maintenancePool) {
              await withProbeClient(maintenancePool, signal, (maintenance) =>
                assertSafePostgresRuntimeIdentity(maintenance, {
                  intendedRole: TENANT_ROLES.maintenance,
                  allowedRoles: Object.values(TENANT_ROLES),
                  allowedLogins,
                }),
              );
            }
            return state;
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
