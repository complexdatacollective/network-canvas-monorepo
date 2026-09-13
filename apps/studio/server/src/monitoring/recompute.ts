import type pg from 'pg';

import {
  OutboxDispatcher,
  type OutboxAdapter,
  type OutboxLease,
  type OutboxRetryOptions,
} from '../outbox/dispatcher.ts';
import type { OutboxObserver, OutboxQueue } from '../outbox/instrumentation.ts';
import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';

type RollupClaim = {
  waveId: string;
  stageId?: string;
  attemptCount: number;
  leaseOwner: string;
};
type RollupQueue = 'study_wave_rollups' | 'study_stage_rollups';

/**
 * Rebuilds one wave and all of its stage rows from source tables. Stage
 * durations come only from interview_sessions.stage_timing; a session without
 * timing remains represented in entered/drop-off counts but contributes no
 * duration interval.
 */
async function recomputeWave(
  client: pg.PoolClient,
  waveId: string,
  recomputedAt: Date,
): Promise<void> {
  await client.query(`delete from study_stage_rollups where wave_id = $1`, [
    waveId,
  ]);
  await client.query(
    `insert into study_stage_rollups (
       team_id, study_id, wave_id, stage_id, entered_count, completed_count,
       abandoned_count, duration_ms_sum, duration_ms_count, missing_item_count,
       stale_at, recomputed_at)
     with timing as (
       select s.team_id, s.study_id, s.wave_id, s.id as session_id, s.status,
              exit_item->>'stageId' as stage_id,
              (exit_item->>'durationMs')::bigint as duration_ms
       from interview_sessions s
       cross join lateral jsonb_array_elements(
         coalesce(s.stage_timing->'stageExits', '[]'::jsonb)
       ) as exit_item
       where s.wave_id = $1
     ),
     observed as (
       select s.team_id, s.study_id, s.wave_id, s.id as session_id,
              s.status, n.stage_id
       from interview_sessions s
       join nodes n on n.session_id = s.id and n.team_id = s.team_id
       where s.wave_id = $1 and n.stage_id is not null
       group by s.team_id, s.study_id, s.wave_id, s.id, s.status, n.stage_id
       union
       select team_id, study_id, wave_id, session_id, status, stage_id
       from timing
     ),
     node_missing as (
       select n.stage_id,
              count(*) filter (where n.attributes = '{}'::jsonb)::int as missing
       from nodes n
       join interview_sessions s
         on s.id = n.session_id and s.team_id = n.team_id
       where s.wave_id = $1 and n.stage_id is not null
       group by n.stage_id
     ),
     timing_totals as (
       select team_id, study_id, wave_id, stage_id,
              sum(duration_ms)::bigint as duration_ms_sum,
              count(*)::int as duration_ms_count
       from timing
       group by team_id, study_id, wave_id, stage_id
     )
     select o.team_id, o.study_id, o.wave_id, o.stage_id,
            count(*)::int,
            count(*) filter (where o.status = 'completed')::int,
            count(*) filter (where o.status = 'abandoned')::int,
            coalesce(max(t.duration_ms_sum), 0)::bigint,
            coalesce(max(t.duration_ms_count), 0)::int,
            coalesce(max(n.missing), 0)::int,
            null,
            $2
     from observed o
     left join timing_totals t
       on t.team_id = o.team_id and t.wave_id = o.wave_id
      and t.stage_id = o.stage_id
     left join node_missing n on n.stage_id = o.stage_id
     group by o.team_id, o.study_id, o.wave_id, o.stage_id`,
    [waveId, recomputedAt],
  );

  await client.query(
    `update study_wave_rollups r
        set invited_count = (
              select count(*)::int from interview_links l
               where l.wave_id = r.wave_id and l.team_id = r.team_id),
            onboarding_started_count = (
              select count(distinct s.participant_id)::int
                from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id
                 and s.participant_id is not null),
            consented_count = (
              select count(distinct s.participant_id)::int
                from interview_sessions s
                join participant_consents pc
                  on pc.participant_id = s.participant_id
                 and pc.team_id = s.team_id and pc.withdrawn_at is null
               where s.wave_id = r.wave_id and s.team_id = r.team_id),
            session_started_count = (
              select count(*)::int from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id),
            session_completed_count = (
              select count(*)::int from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id
                 and s.status = 'completed'),
            session_abandoned_count = (
              select count(*)::int from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id
                 and s.status = 'abandoned'),
            delivery_failed_count = (
              select count(*)::int from message_deliveries d
              join schedule_occurrences o
                on o.id = d.occurrence_id and o.team_id = d.team_id
              join study_schedules sc
                on sc.id = o.schedule_id and sc.team_id = o.team_id
               where sc.wave_id = r.wave_id and d.team_id = r.team_id
                 and d.failed_at is not null),
            stale_at = null,
            recomputed_at = $2
      where r.wave_id = $1`,
    [waveId, recomputedAt],
  );
}

function tableFor(
  queue: RollupQueue,
): 'study_wave_rollups' | 'study_stage_rollups' {
  return queue;
}

class MonitoringRollupAdapter implements OutboxAdapter<RollupClaim> {
  readonly queue: OutboxQueue;
  private readonly pool: pg.Pool;
  private readonly table: 'study_wave_rollups' | 'study_stage_rollups';

  constructor(pool: pg.Pool, queue: RollupQueue) {
    this.pool = pool;
    this.queue = queue;
    this.table = tableFor(queue);
  }

  async suppressUndeliverable(): Promise<number> {
    return 0;
  }

  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    const result = await this.pool.query(
      `update ${this.table}
          set failed_at = clock_timestamp(),
              lease_owner = null,
              lease_expires_at = null,
              stale_at = null,
              last_error = coalesce(last_error, 'rollup worker stopped during the final attempt')
        where stale_at is not null
          and failed_at is null
          and attempt_count >= $1
          and (lease_expires_at is null or lease_expires_at <= clock_timestamp())`,
      [maxAttempts],
    );
    return result.rowCount ?? 0;
  }

  async claim(
    lease: OutboxLease,
    maxAttempts: number,
  ): Promise<RollupClaim | null> {
    const stageColumns =
      this.table === 'study_stage_rollups' ? ', stage_id' : '';
    const stageReturn =
      this.table === 'study_stage_rollups' ? ', r.stage_id' : '';
    const result = await this.pool.query<{
      wave_id: string;
      stage_id?: string;
      attempt_count: number;
    }>(
      `with candidate as (
         select r.wave_id${stageColumns}
           from ${this.table} r
          where r.stale_at is not null
            and r.failed_at is null
            and r.attempt_count < $3
            and (r.lease_expires_at is null or r.lease_expires_at <= clock_timestamp())
            and pg_try_advisory_xact_lock(hashtext('monitoring-rollup'), hashtext(r.wave_id::text))
          order by r.stale_at, r.wave_id${this.table === 'study_stage_rollups' ? ', r.stage_id' : ''}
          for update skip locked
          limit 1
       )
       update ${this.table} r
          set lease_owner = $1,
              lease_expires_at = clock_timestamp() + make_interval(secs => $2::float / 1000),
              attempt_count = r.attempt_count + 1
         from candidate c
        where r.wave_id = c.wave_id
          ${this.table === 'study_stage_rollups' ? 'and r.stage_id = c.stage_id' : ''}
        returning r.wave_id${stageReturn}, r.attempt_count`,
      [lease.owner, lease.durationMs, maxAttempts],
    );
    const row = result.rows[0];
    return row
      ? {
          waveId: row.wave_id,
          ...(row.stage_id ? { stageId: row.stage_id } : {}),
          attemptCount: row.attempt_count,
          leaseOwner: lease.owner,
        }
      : null;
  }

  async remainsDeliverable(
    claim: RollupClaim,
    lease: OutboxLease,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from ${this.table}
        where wave_id = $1
          ${claim.stageId ? 'and stage_id = $2' : ''}
          and lease_owner = $${claim.stageId ? 3 : 2}
          and stale_at is not null and failed_at is null`,
      claim.stageId
        ? [claim.waveId, claim.stageId, lease.owner]
        : [claim.waveId, lease.owner],
    );
    return result.rowCount === 1;
  }

  async suppressClaim(): Promise<boolean> {
    return false;
  }

  async renewLease(claim: RollupClaim, lease: OutboxLease): Promise<boolean> {
    const stage = claim.stageId !== undefined;
    const result = await this.pool.query(
      `update ${this.table}
          set lease_expires_at = clock_timestamp() + make_interval(secs => $${stage ? 4 : 3}::float / 1000)
        where wave_id = $1
          ${stage ? 'and stage_id = $2' : ''}
          and lease_owner = $${stage ? 3 : 2}
          and stale_at is not null and failed_at is null`,
      stage
        ? [claim.waveId, claim.stageId, lease.owner, lease.durationMs]
        : [claim.waveId, lease.owner, lease.durationMs],
    );
    return result.rowCount === 1;
  }

  async deliver(claim: RollupClaim): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `select pg_advisory_xact_lock(hashtext('monitoring-rollup'), hashtext($1))`,
        [claim.waveId],
      );
      const owned = await client.query(
        `select 1 from ${this.table}
          where wave_id = $1
            ${claim.stageId ? 'and stage_id = $2' : ''}
            and lease_owner = $${claim.stageId ? 3 : 2}
            and stale_at is not null and failed_at is null`,
        claim.stageId
          ? [claim.waveId, claim.stageId, claim.leaseOwner]
          : [claim.waveId, claim.leaseOwner],
      );
      if (owned.rowCount === 0) {
        if (claim.stageId) {
          await client.query('commit');
          return;
        }
        throw new Error('rollup lease was lost before recompute');
      }
      await recomputeWave(client, claim.waveId, new Date());
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  failureDisposition(): 'retryable' {
    return 'retryable';
  }

  completionFailureDisposition(): 'retryable' {
    return 'retryable';
  }

  async recordFailure(
    claim: RollupClaim,
    lease: OutboxLease,
    error: unknown,
    retryDelayMs: number | null,
  ): Promise<boolean> {
    const terminal = retryDelayMs === null;
    const stage = claim.stageId !== undefined;
    const result = await this.pool.query(
      `update ${this.table}
          set lease_owner = null,
              lease_expires_at = null,
              stale_at = case when $${stage ? 5 : 4}::boolean then null
                              else clock_timestamp() + make_interval(secs => $${stage ? 6 : 5}::float / 1000) end,
              failed_at = case when $${stage ? 5 : 4}::boolean then clock_timestamp() else null end,
              last_error = $${stage ? 4 : 3}
        where wave_id = $1
          ${stage ? 'and stage_id = $2' : ''}
          and lease_owner = $${stage ? 3 : 2}`,
      stage
        ? [
            claim.waveId,
            claim.stageId,
            lease.owner,
            String(error).slice(0, 1000),
            terminal,
            retryDelayMs ?? 0,
          ]
        : [
            claim.waveId,
            lease.owner,
            String(error).slice(0, 1000),
            terminal,
            retryDelayMs ?? 0,
          ],
    );
    return result.rowCount === 1;
  }

  async recordComplete(
    claim: RollupClaim,
    lease: OutboxLease,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update ${this.table}
          set lease_owner = null, lease_expires_at = null, last_error = null
        where wave_id = $1
          ${claim.stageId ? 'and stage_id = $2' : ''}
          and lease_owner = $${claim.stageId ? 3 : 2}`,
      claim.stageId
        ? [claim.waveId, claim.stageId, lease.owner]
        : [claim.waveId, lease.owner],
    );
    if (result.rowCount === 1) return true;
    if (!claim.stageId) return false;
    const pending = await this.pool.query(
      `select 1 from study_stage_rollups where wave_id = $1 and stage_id = $2 and stale_at is not null and failed_at is null`,
      [claim.waveId, claim.stageId],
    );
    return pending.rowCount === 0;
  }

  async recordUncertain(
    claim: RollupClaim,
    lease: OutboxLease,
    error: unknown,
  ): Promise<boolean> {
    return this.recordFailure(claim, lease, error, null);
  }
}

function rollupDispatcher(
  pool: pg.Pool,
  queue: RollupQueue,
  options: OutboxRetryOptions & { observer?: OutboxObserver },
) {
  return new OutboxDispatcher({
    ...options,
    pool,
    adapter: new MonitoringRollupAdapter(pool, queue),
  });
}

/** Claims and recomputes at most one stale wave through shared dispatch semantics. */
export async function runMonitoringRollupOnce(
  pool: pg.Pool,
): Promise<{ claimed: number }> {
  const result = await rollupDispatcher(
    pool,
    'study_wave_rollups',
    {},
  ).runOnce();
  return { claimed: result.claimed };
}

export async function runMonitoringStageRollupOnce(
  pool: pg.Pool,
): Promise<{ claimed: number }> {
  const result = await rollupDispatcher(
    pool,
    'study_stage_rollups',
    {},
  ).runOnce();
  return { claimed: result.claimed };
}

/** Both derived worklists use the shared lease, retry and observer machinery. */
export function startMonitoringRollupWorker(options: {
  pool: pg.Pool;
  observer?: OutboxObserver;
  onError?: (error: unknown) => void | Promise<void>;
  pollIntervalMs?: number;
}): OutboxWorker {
  const wave = rollupDispatcher(options.pool, 'study_wave_rollups', options);
  const stage = rollupDispatcher(options.pool, 'study_stage_rollups', options);
  const waveWorker = startOutboxWorker({
    queue: 'study_wave_rollups',
    pollIntervalMs: options.pollIntervalMs,
    observer: options.observer,
    onError: options.onError,
    runOnce: async () => wave.runOnce(),
  });
  const stageWorker = startOutboxWorker({
    queue: 'study_stage_rollups',
    pollIntervalMs: options.pollIntervalMs,
    observer: options.observer,
    onError: options.onError,
    runOnce: async () => stage.runOnce(),
  });
  return {
    stop: async () => {
      await Promise.all([waveWorker.stop(), stageWorker.stop()]);
    },
  };
}
