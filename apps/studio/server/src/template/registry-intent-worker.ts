import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

const DEFAULT_LEASE_MS = 5 * 60_000;
const DEFAULT_RETRY_MS = 5_000;

export type ClaimedTemplateRegistryIntent = {
  kind: 'publication' | 'import';
  id: string;
  teamId: string;
  leaseOwner: string;
};

export type TemplateRegistryIntentDisposition = 'completed' | 'deferred';

type Options = {
  pool: pg.Pool;
  process(
    intent: ClaimedTemplateRegistryIntent,
  ): Promise<TemplateRegistryIntentDisposition>;
  onError?: (error: unknown) => void | Promise<void>;
  pollIntervalMs?: number;
  drainLimit?: number;
  leaseMs?: number;
  retryMs?: number;
};

async function assertMaintenance(pool: pg.Pool): Promise<void> {
  const role = await pool.query<{ role: string }>(
    'SELECT current_user AS role',
  );
  if (role.rows[0]?.role !== TENANT_ROLES.maintenance)
    throw new Error('Registry intent worker requires the maintenance role');
}

/** Claim the oldest eligible intent across both queues in one statement. */
export async function claimTemplateRegistryIntent(
  pool: pg.Pool,
  leaseMs = DEFAULT_LEASE_MS,
): Promise<ClaimedTemplateRegistryIntent | null> {
  await assertMaintenance(pool);
  const leaseOwner = randomUUID();
  const claimed = await pool.query<{
    kind: ClaimedTemplateRegistryIntent['kind'];
    id: string;
    team_id: string;
  }>(
    `WITH publication_candidate AS MATERIALIZED (
       SELECT id, team_id, available_at, created_at
       FROM template_registry_publication_intents
       WHERE completed_at IS NULL AND quarantined_at IS NULL
         AND available_at <= clock_timestamp()
         AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
       ORDER BY available_at, created_at, id
       FOR UPDATE SKIP LOCKED LIMIT 1
     ), import_candidate AS MATERIALIZED (
       SELECT id, team_id, available_at, created_at
       FROM template_registry_import_intents
       WHERE completed_at IS NULL AND quarantined_at IS NULL
         AND available_at <= clock_timestamp()
         AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
       ORDER BY available_at, created_at, id
       FOR UPDATE SKIP LOCKED LIMIT 1
     ), selected AS MATERIALIZED (
       SELECT 'publication'::text AS kind, * FROM publication_candidate
       UNION ALL
       SELECT 'import'::text AS kind, * FROM import_candidate
       ORDER BY available_at, created_at, id
       LIMIT 1
     ), claimed_publication AS (
       UPDATE template_registry_publication_intents intent
       SET lease_owner = $1,
           lease_expires_at = clock_timestamp()
             + make_interval(secs => $2::float / 1000),
           attempt_count = attempt_count + 1
       FROM selected
       WHERE selected.kind = 'publication' AND intent.id = selected.id
       RETURNING 'publication'::text AS kind, intent.id, intent.team_id
     ), claimed_import AS (
       UPDATE template_registry_import_intents intent
       SET lease_owner = $1,
           lease_expires_at = clock_timestamp()
             + make_interval(secs => $2::float / 1000),
           attempt_count = attempt_count + 1
       FROM selected
       WHERE selected.kind = 'import' AND intent.id = selected.id
       RETURNING 'import'::text AS kind, intent.id, intent.team_id
     )
     SELECT * FROM claimed_publication
     UNION ALL
     SELECT * FROM claimed_import`,
    [leaseOwner, leaseMs],
  );
  const row = claimed.rows[0];
  return row
    ? {
        kind: row.kind,
        id: row.id,
        teamId: row.team_id,
        leaseOwner,
      }
    : null;
}

export async function claimSpecificTemplateRegistryIntent(
  pool: pg.Pool,
  kind: ClaimedTemplateRegistryIntent['kind'],
  id: string,
  leaseMs = DEFAULT_LEASE_MS,
): Promise<ClaimedTemplateRegistryIntent | null> {
  await assertMaintenance(pool);
  const leaseOwner = randomUUID();
  const table =
    kind === 'publication'
      ? 'template_registry_publication_intents'
      : 'template_registry_import_intents';
  const claimed = await pool.query<{ team_id: string }>(
    `UPDATE ${table}
     SET lease_owner = $2,
         lease_expires_at = clock_timestamp()
           + make_interval(secs => $3::float / 1000),
         attempt_count = attempt_count + 1
     WHERE id = $1 AND completed_at IS NULL AND quarantined_at IS NULL
       AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
     RETURNING team_id`,
    [id, leaseOwner, leaseMs],
  );
  const row = claimed.rows[0];
  return row ? { kind, id, teamId: row.team_id, leaseOwner } : null;
}

function intentTable(intent: ClaimedTemplateRegistryIntent): string {
  return intent.kind === 'publication'
    ? 'template_registry_publication_intents'
    : 'template_registry_import_intents';
}

async function renewTemplateRegistryIntentLease(
  pool: pg.Pool,
  intent: ClaimedTemplateRegistryIntent,
  leaseMs: number,
): Promise<boolean> {
  const renewed = await pool.query(
    `UPDATE ${intentTable(intent)}
     SET lease_expires_at = clock_timestamp()
       + make_interval(secs => $3::float / 1000)
     WHERE id = $1 AND lease_owner = $2
       AND lease_expires_at > clock_timestamp()
       AND completed_at IS NULL AND quarantined_at IS NULL`,
    [intent.id, intent.leaseOwner, leaseMs],
  );
  return renewed.rowCount === 1;
}

export async function deferTemplateRegistryIntent(
  pool: pg.Pool,
  intent: ClaimedTemplateRegistryIntent,
  retryMs: number,
): Promise<boolean> {
  const deferred = await pool.query(
    `UPDATE ${intentTable(intent)}
     SET lease_owner = NULL, lease_expires_at = NULL,
         available_at = clock_timestamp()
           + make_interval(secs => $3::float / 1000)
     WHERE id = $1 AND lease_owner = $2
       AND completed_at IS NULL AND quarantined_at IS NULL`,
    [intent.id, intent.leaseOwner, retryMs],
  );
  return deferred.rowCount === 1;
}

export async function reconcileNextTemplateRegistryIntent(
  options: Pick<Options, 'pool' | 'process' | 'leaseMs' | 'retryMs'>,
): Promise<{ claimed: number }> {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const intent = await claimTemplateRegistryIntent(options.pool, leaseMs);
  if (!intent) return { claimed: 0 };

  let lostLease = false;
  const renewal = setInterval(
    () => {
      void renewTemplateRegistryIntentLease(options.pool, intent, leaseMs)
        .then((renewed) => (lostLease ||= !renewed))
        .catch(() => (lostLease = true));
    },
    Math.max(10, Math.floor(leaseMs / 3)),
  );

  try {
    const disposition = await options.process(intent);
    if (lostLease)
      throw new Error('Registry intent lease was lost during reconciliation');
    if (disposition === 'deferred') {
      const owned = await deferTemplateRegistryIntent(
        options.pool,
        intent,
        retryMs,
      );
      if (!owned)
        throw new Error('Registry intent lease was lost before deferral');
    }
    return { claimed: 1 };
  } catch (error) {
    await deferTemplateRegistryIntent(options.pool, intent, retryMs).catch(
      () => undefined,
    );
    throw error;
  } finally {
    clearInterval(renewal);
  }
}
