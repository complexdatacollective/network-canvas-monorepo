import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { OutboxQueue } from '../outbox/instrumentation.ts';
import { BoundedProbe, withProbeClient } from './bounded-probe.ts';

type QueueShape = {
  pending: string;
  available: string;
  lease?: string;
  failed?: string;
  uncertain?: string;
  suppressed?: string;
};

// Static SQL only, exhaustive over the dispatcher's supported queue names.
// Rollups are dirty worklists, without invented lease or terminal columns.
const shapes = {
  team_invitation_deliveries: {
    pending:
      'sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL',
    available: 'available_at',
    lease: 'lease_expires_at',
    failed: 'failed_at',
    uncertain: 'uncertain_at',
    suppressed: 'suppressed_at',
  },
  audit_alert_outbox: {
    pending:
      'delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL',
    available: 'available_at',
    lease: 'lease_expires_at',
    failed: 'failed_at',
    suppressed: 'suppressed_at',
  },
  audit_export_jobs: {
    pending: "status IN ('pending', 'generating')",
    available: 'available_at',
    lease: 'lease_expires_at',
    failed: 'failed_at',
  },
  message_deliveries: {
    pending:
      'sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL',
    available: 'available_at',
    lease: 'lease_expires_at',
    failed: 'failed_at',
    uncertain: 'uncertain_at',
    suppressed: 'suppressed_at',
  },
  webhook_deliveries: {
    pending: 'delivered_at IS NULL AND failed_at IS NULL',
    available: 'available_at',
    lease: 'lease_expires_at',
    failed: 'failed_at',
  },
  study_wave_rollups: {
    pending: 'stale_at IS NOT NULL',
    available: 'stale_at',
  },
  study_stage_rollups: {
    pending: 'stale_at IS NOT NULL',
    available: 'stale_at',
  },
} satisfies Record<OutboxQueue, QueueShape>;

const count = (condition: string | undefined) =>
  condition ? `COUNT(*) FILTER (WHERE ${condition})::float8` : '0::float8';

const queueSql = Object.entries(shapes)
  .map(([queue, shape]: [string, QueueShape]) => {
    const pending = `(${shape.pending})`;
    const ready = `${pending} AND ${shape.available} <= CURRENT_TIMESTAMP${shape.lease ? ` AND (${shape.lease} IS NULL OR ${shape.lease} <= CURRENT_TIMESTAMP)` : ''}`;
    return `SELECT '${queue}' AS queue,
    ${count(pending)} AS pending,
    ${count(ready)} AS ready,
    COALESCE(GREATEST(0, EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - MIN(${shape.available}) FILTER (WHERE ${ready}))), 0)::float8 AS oldest_ready_seconds,
    ${count(shape.lease && `${pending} AND ${shape.lease} > CURRENT_TIMESTAMP`)} AS leased,
    ${count(shape.lease && `${pending} AND ${shape.lease} <= CURRENT_TIMESTAMP`)} AS expired_leases,
    ${count(shape.failed && `${shape.failed} IS NOT NULL`)} AS failed,
    ${shape.failed ? `COALESCE(EXTRACT(EPOCH FROM MAX(${shape.failed})), 0)::float8` : '0::float8'} AS last_failure_timestamp_seconds,
    ${count(shape.uncertain && `${shape.uncertain} IS NOT NULL`)} AS uncertain,
    ${count(shape.suppressed && `${shape.suppressed} IS NOT NULL`)} AS suppressed
    FROM ${queue}`;
  })
  .join('\nUNION ALL\n');

export type QueueSnapshot = {
  queue: OutboxQueue;
  pending: number;
  ready: number;
  oldest_ready_seconds: number;
  leased: number;
  expired_leases: number;
  failed: number;
  last_failure_timestamp_seconds: number;
  uncertain: number;
  suppressed: number;
};

export function createQueueProbe(
  pool?: pg.Pool,
  timeoutMs?: number,
  cacheMs?: number,
) {
  return new BoundedProbe<QueueSnapshot[]>(
    pool
      ? (signal) =>
          withProbeClient(pool, signal, async (client) => {
            // An application-role scrape would silently report empty queues under
            // RLS. Refuse it instead of publishing a false healthy observation.
            const role = await client.query<{ role: string }>(
              'SELECT current_user AS role',
            );
            if (role.rows[0]?.role !== TENANT_ROLES.maintenance)
              throw new Error('queue probe requires maintenance role');
            const result = await client.query<QueueSnapshot>(queueSql);
            return result.rows;
          })
      : undefined,
    timeoutMs,
    cacheMs,
  );
}
