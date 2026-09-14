import type pg from 'pg';

import type { AssetStore } from '../assets.ts';
import { checkSchema, type SchemaState } from '../db/schema.ts';
import { BoundedProbe, withProbeClient } from './bounded-probe.ts';

export function createReadiness(options: {
  pool?: pg.Pool;
  assetStore?: AssetStore;
  timeoutMs?: number;
  cacheMs?: number;
}) {
  const { pool, assetStore, timeoutMs, cacheMs } = options;
  const database = new BoundedProbe<SchemaState>(
    pool
      ? (signal) =>
          withProbeClient(pool, signal, async (client) => {
            await client.query('SELECT 1');
            return checkSchema(client);
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
