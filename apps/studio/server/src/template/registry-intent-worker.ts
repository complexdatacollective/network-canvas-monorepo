import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';

const LEASE_MS = 30_000;
const RETRY_MS = 5_000;

export type ClaimedTemplateRegistryIntent = {
  kind: 'publication' | 'import';
  id: string;
  teamId: string;
  leaseOwner: string;
};

type Options = {
  pool: pg.Pool;
  process(intent: ClaimedTemplateRegistryIntent): Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  pollIntervalMs?: number;
  drainLimit?: number;
};

async function assertMaintenance(client: pg.PoolClient): Promise<void> {
  const role = await client.query<{ role: string }>(
    'SELECT current_user AS role',
  );
  if (role.rows[0]?.role !== TENANT_ROLES.maintenance)
    throw new Error('Registry intent worker requires the maintenance role');
}

async function claimFrom(
  client: pg.PoolClient,
  table: string,
  kind: ClaimedTemplateRegistryIntent['kind'],
): Promise<ClaimedTemplateRegistryIntent | null> {
  const leaseOwner = randomUUID();
  const claimed = await client.query<{ id: string; team_id: string }>(
    `WITH candidate AS (
       SELECT id FROM ${table}
       WHERE completed_at IS NULL AND quarantined_at IS NULL
         AND available_at <= clock_timestamp()
         AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
       ORDER BY available_at, created_at, id
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE ${table} intent
     SET lease_owner = $1,
         lease_expires_at = clock_timestamp() + make_interval(secs => $2::float / 1000),
         attempt_count = attempt_count + 1
     FROM candidate
     WHERE intent.id = candidate.id
     RETURNING intent.id, intent.team_id`,
    [leaseOwner, LEASE_MS],
  );
  const row = claimed.rows[0];
  return row ? { kind, id: row.id, teamId: row.team_id, leaseOwner } : null;
}

export async function claimTemplateRegistryIntent(
  pool: pg.Pool,
): Promise<ClaimedTemplateRegistryIntent | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertMaintenance(client);
    const claimed =
      (await claimFrom(
        client,
        'template_registry_publication_intents',
        'publication',
      )) ??
      (await claimFrom(client, 'template_registry_import_intents', 'import'));
    await client.query('COMMIT');
    return claimed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deferTemplateRegistryIntent(
  pool: pg.Pool,
  intent: ClaimedTemplateRegistryIntent,
): Promise<void> {
  const table =
    intent.kind === 'publication'
      ? 'template_registry_publication_intents'
      : 'template_registry_import_intents';
  await pool.query(
    `UPDATE ${table}
     SET lease_owner = NULL, lease_expires_at = NULL,
         available_at = clock_timestamp() + make_interval(secs => $3::float / 1000)
     WHERE id = $1 AND lease_owner = $2
       AND completed_at IS NULL AND quarantined_at IS NULL`,
    [intent.id, intent.leaseOwner, RETRY_MS],
  );
}

export async function reconcileNextTemplateRegistryIntent(
  options: Pick<Options, 'pool' | 'process'>,
): Promise<{ claimed: number }> {
  const intent = await claimTemplateRegistryIntent(options.pool);
  if (!intent) return { claimed: 0 };
  try {
    await options.process(intent);
    return { claimed: 1 };
  } catch (error) {
    await deferTemplateRegistryIntent(options.pool, intent).catch(
      () => undefined,
    );
    throw error;
  }
}

export function startTemplateRegistryIntentWorker(
  options: Options,
): OutboxWorker {
  return startOutboxWorker({
    queue: 'template_registry_intents',
    runOnce: async () =>
      await reconcileNextTemplateRegistryIntent({
        pool: options.pool,
        process: async (intent) => await options.process(intent),
      }),
    onError: options.onError,
    pollIntervalMs: options.pollIntervalMs,
    drainLimit: options.drainLimit,
  });
}
