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
  dirtyGeneration: string;
  attemptCount: number;
  leaseOwner: string;
};
type WaveCounts = {
  invited_count: number;
  onboarding_started_count: number;
  consented_count: number;
  session_started_count: number;
  session_completed_count: number;
  session_abandoned_count: number;
  delivery_failed_count: number;
};
type MonitoringRollupOptions = OutboxRetryOptions & {
  observer?: OutboxObserver;
  afterRecompute?: () => Promise<void>;
};
const INVALIDATION_BATCH_SIZE = 1_000;

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
): Promise<WaveCounts> {
  await client.query(
    `insert into study_stage_rollups (
       team_id, study_id, wave_id, stage_id, entered_count, completed_count,
       abandoned_count, duration_ms_sum, duration_ms_count, missing_item_count,
       stale_at, recomputed_at)
     with timing as (
       select s.team_id, s.study_id, s.wave_id, s.id as session_id,
              exit_item->>'stageId' as stage_id,
              round((exit_item->>'durationMs')::numeric)::bigint as duration_ms,
              exit_item->>'exitDirection' as exit_direction,
              ordinal
       from interview_sessions s
       cross join lateral jsonb_array_elements(
         coalesce(s.stage_timing->'stageExits', '[]'::jsonb)
       ) with ordinality as exits(exit_item, ordinal)
       where s.wave_id = $1
     ),
     latest_exit as (
       select distinct on (session_id, stage_id)
              team_id, study_id, wave_id, session_id, stage_id, exit_direction
       from timing
       order by session_id, stage_id, ordinal desc
     ),
     authored_current as (
       select s.team_id, s.study_id, s.wave_id, s.id as session_id,
              s.current_stage_id as stage_id
       from interview_sessions s
       join version_sections stage_order_pin
         on stage_order_pin.version_id = s.protocol_version_id
        and stage_order_pin.team_id = s.team_id
        and stage_order_pin.section_id = 'stageOrder'
       join sections stage_order
         on stage_order.team_id = stage_order_pin.team_id
        and stage_order.hash = stage_order_pin.section_hash
       where s.wave_id = $1
         and s.current_stage_id is not null
         and s.current_stage_index >= 0
         and s.current_stage_index < case
               when jsonb_typeof(stage_order.doc->'stages') = 'array'
                 then jsonb_array_length(stage_order.doc->'stages')
               else 0
             end
         and stage_order.doc->'stages'->>s.current_stage_index =
             s.current_stage_id
     ),
     observed as (
       select team_id, study_id, wave_id, session_id, stage_id
       from authored_current
       union
       select s.team_id, s.study_id, s.wave_id, s.id as session_id,
              n.stage_id
       from interview_sessions s
       join nodes n on n.session_id = s.id and n.team_id = s.team_id
       where s.wave_id = $1 and n.stage_id is not null
       group by s.team_id, s.study_id, s.wave_id, s.id, n.stage_id
       union
       select team_id, study_id, wave_id, session_id, stage_id
       from timing
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
            count(*) filter (where x.exit_direction in ('forward', 'jumped'))::int,
            count(*) filter (where x.exit_direction = 'abandoned')::int,
            coalesce(max(t.duration_ms_sum), 0)::bigint,
            coalesce(max(t.duration_ms_count), 0)::int,
            -- Schema 8 removes nullish attributes and has no persisted
            -- missing-reason value. Empty attribute bags are valid answers.
            0,
            null,
            $2
     from observed o
     left join timing_totals t
       on t.team_id = o.team_id and t.wave_id = o.wave_id
      and t.stage_id = o.stage_id
     left join latest_exit x
       on x.session_id = o.session_id and x.stage_id = o.stage_id
     group by o.team_id, o.study_id, o.wave_id, o.stage_id
     on conflict (wave_id, stage_id) do update
       set entered_count = excluded.entered_count,
           completed_count = excluded.completed_count,
           abandoned_count = excluded.abandoned_count,
           duration_ms_sum = excluded.duration_ms_sum,
           duration_ms_count = excluded.duration_ms_count,
           missing_item_count = excluded.missing_item_count,
           recomputed_at = excluded.recomputed_at`,
    [waveId, recomputedAt],
  );

  await client.query(
    `update study_stage_rollups r
        set entered_count = 0, completed_count = 0, abandoned_count = 0,
            duration_ms_sum = 0, duration_ms_count = 0,
            missing_item_count = 0, recomputed_at = $2
      where r.wave_id = $1
        and r.lease_owner is not null
        and r.lease_expires_at > clock_timestamp()
        and not exists (
          select 1 from interview_sessions s
          join nodes n on n.session_id = s.id and n.team_id = s.team_id
          where s.wave_id = r.wave_id and n.stage_id = r.stage_id
        )
        and not exists (
          select 1 from interview_sessions s
          join version_sections stage_order_pin
            on stage_order_pin.version_id = s.protocol_version_id
           and stage_order_pin.team_id = s.team_id
           and stage_order_pin.section_id = 'stageOrder'
          join sections stage_order
            on stage_order.team_id = stage_order_pin.team_id
           and stage_order.hash = stage_order_pin.section_hash
          where s.wave_id = r.wave_id
            and s.current_stage_id = r.stage_id
            and s.current_stage_index >= 0
            and s.current_stage_index < case
                  when jsonb_typeof(stage_order.doc->'stages') = 'array'
                    then jsonb_array_length(stage_order.doc->'stages')
                  else 0
                end
            and stage_order.doc->'stages'->>s.current_stage_index =
                s.current_stage_id
        )
        and not exists (
          select 1 from interview_sessions s
          cross join lateral jsonb_array_elements(
            coalesce(s.stage_timing->'stageExits', '[]'::jsonb)
          ) exit_item
          where s.wave_id = r.wave_id
            and exit_item->>'stageId' = r.stage_id
        )`,
    [waveId, recomputedAt],
  );

  await client.query(
    `delete from study_stage_rollups r
      where r.wave_id = $1
        and (r.lease_owner is null or r.lease_expires_at <= clock_timestamp())
        and not exists (
          select 1 from interview_sessions s
          join version_sections stage_order_pin
            on stage_order_pin.version_id = s.protocol_version_id
           and stage_order_pin.team_id = s.team_id
           and stage_order_pin.section_id = 'stageOrder'
          join sections stage_order
            on stage_order.team_id = stage_order_pin.team_id
           and stage_order.hash = stage_order_pin.section_hash
          where s.wave_id = r.wave_id
            and s.current_stage_id = r.stage_id
            and s.current_stage_index >= 0
            and s.current_stage_index < case
                  when jsonb_typeof(stage_order.doc->'stages') = 'array'
                    then jsonb_array_length(stage_order.doc->'stages')
                  else 0
                end
            and stage_order.doc->'stages'->>s.current_stage_index =
                s.current_stage_id
        )
        and not exists (
          select 1 from interview_sessions s
          join nodes n on n.session_id = s.id and n.team_id = s.team_id
          where s.wave_id = r.wave_id and n.stage_id = r.stage_id
        )
        and not exists (
          select 1 from interview_sessions s
          cross join lateral jsonb_array_elements(
            coalesce(s.stage_timing->'stageExits', '[]'::jsonb)
          ) exit_item
          where s.wave_id = r.wave_id
            and exit_item->>'stageId' = r.stage_id
        )`,
    [waveId],
  );

  const counts = await client.query<WaveCounts>(
    `select (
              select count(*)::int from interview_links l
               where l.wave_id = r.wave_id and l.team_id = r.team_id) AS invited_count,
            (
              select count(distinct s.participant_id)::int
                from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id
                 and s.participant_id is not null) AS onboarding_started_count,
            (
              select count(distinct s.participant_id)::int
                from interview_sessions s
                join participant_consents pc
                  on pc.participant_id = s.participant_id
                 and pc.team_id = s.team_id and pc.withdrawn_at is null
               where s.wave_id = r.wave_id and s.team_id = r.team_id) AS consented_count,
            (
              select count(*)::int from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id) AS session_started_count,
            (
              select count(*)::int from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id
                 and s.status = 'completed') AS session_completed_count,
            (
              select count(*)::int from interview_sessions s
               where s.wave_id = r.wave_id and s.team_id = r.team_id
                 and s.status = 'abandoned') AS session_abandoned_count,
            (
              select count(*)::int from message_deliveries d
              join schedule_occurrences o
                on o.id = d.occurrence_id and o.team_id = d.team_id
              join study_schedules sc
                on sc.id = o.schedule_id and sc.team_id = o.team_id
               where sc.wave_id = r.wave_id and d.team_id = r.team_id
                 and d.failed_at is not null) AS delivery_failed_count
       from study_wave_rollups r
      where r.wave_id = $1`,
    [waveId],
  );
  const row = counts.rows[0];
  if (!row) throw new Error('rollup wave disappeared during recompute');
  return row;
}

class MonitoringRollupAdapter implements OutboxAdapter<RollupClaim> {
  readonly queue: OutboxQueue = 'study_wave_rollups';
  private readonly pool: pg.Pool;
  private readonly afterRecompute: (() => Promise<void>) | undefined;

  constructor(pool: pg.Pool, afterRecompute?: () => Promise<void>) {
    this.pool = pool;
    this.afterRecompute = afterRecompute;
  }

  async suppressUndeliverable(): Promise<number> {
    await this.pool.query(
      `with claimed as (
         delete from monitoring_rollup_invalidations
          where id in (
            select id from monitoring_rollup_invalidations
             order by created_at, id limit $1
          )
          returning team_id, study_id, wave_id
       ), waves as (
         select team_id, study_id, wave_id from claimed
         group by team_id, study_id, wave_id
       ), queued as (
         insert into study_wave_rollups (
           team_id, study_id, wave_id, dirty_generation, stale_at)
         select team_id, study_id, wave_id, 1, clock_timestamp() from waves
         on conflict (wave_id) do update
           set dirty_generation = study_wave_rollups.dirty_generation + 1,
               stale_at = clock_timestamp(), attempt_count = 0,
               failed_at = null, last_error = null,
               lease_owner = null, lease_expires_at = null
         returning wave_id
       )
       select count(*) from queued`,
      [INVALIDATION_BATCH_SIZE],
    );
    return 0;
  }

  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    const result = await this.pool.query(
      `update study_wave_rollups
          set failed_at = clock_timestamp(),
              lease_owner = null,
              lease_expires_at = null,
              stale_at = null,
              last_error = coalesce(last_error, 'rollup worker stopped during the final attempt')
        where stale_at is not null
          and stale_at <= clock_timestamp()
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
    const result = await this.pool.query<{
      wave_id: string;
      dirty_generation: string;
      attempt_count: number;
    }>(
      `with candidate as (
         select r.wave_id
           from study_wave_rollups r
          where r.stale_at is not null
            and r.stale_at <= clock_timestamp()
            and r.failed_at is null
            and r.attempt_count < $3
            and (r.lease_expires_at is null or r.lease_expires_at <= clock_timestamp())
            and pg_try_advisory_xact_lock(hashtext('monitoring-rollup'), hashtext(r.wave_id::text))
          order by r.stale_at, r.wave_id
          for update skip locked
          limit 1
       )
       update study_wave_rollups r
          set lease_owner = $1,
              lease_expires_at = clock_timestamp() + make_interval(secs => $2::float / 1000),
              attempt_count = r.attempt_count + 1
         from candidate c
        where r.wave_id = c.wave_id
        returning r.wave_id, r.dirty_generation, r.attempt_count`,
      [lease.owner, lease.durationMs, maxAttempts],
    );
    const row = result.rows[0];
    return row
      ? {
          waveId: row.wave_id,
          dirtyGeneration: row.dirty_generation,
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
      `select 1 from study_wave_rollups
        where wave_id = $1
          and dirty_generation = $2
          and lease_owner = $3
          and lease_expires_at > clock_timestamp()
          and stale_at is not null and failed_at is null`,
      [claim.waveId, claim.dirtyGeneration, lease.owner],
    );
    return result.rowCount === 1;
  }

  async suppressClaim(): Promise<boolean> {
    return false;
  }

  async renewLease(claim: RollupClaim, lease: OutboxLease): Promise<boolean> {
    const result = await this.pool.query(
      `update study_wave_rollups
          set lease_expires_at = clock_timestamp() + make_interval(secs => $4::float / 1000)
        where wave_id = $1
          and dirty_generation = $2
          and lease_owner = $3
          and lease_expires_at > clock_timestamp()
          and stale_at is not null and failed_at is null`,
      [claim.waveId, claim.dirtyGeneration, lease.owner, lease.durationMs],
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
        `select 1 from study_wave_rollups
          where wave_id = $1
            and dirty_generation = $2
            and lease_owner = $3
            and lease_expires_at > clock_timestamp()
            and stale_at is not null and failed_at is null`,
        [claim.waveId, claim.dirtyGeneration, claim.leaseOwner],
      );
      if (owned.rowCount === 0) {
        throw new Error('rollup lease was lost before recompute');
      }
      const recomputedAt = new Date();
      const counts = await recomputeWave(client, claim.waveId, recomputedAt);
      await this.afterRecompute?.();
      // Expensive reads and stage updates do not lock the wave lease row.
      // Publish only while this same source generation and lease still belong
      // to us; otherwise roll back the derived stage rows as well.
      const published = await client.query(
        `update study_wave_rollups
            set invited_count = $3, onboarding_started_count = $4,
                consented_count = $5, session_started_count = $6,
                session_completed_count = $7, session_abandoned_count = $8,
                delivery_failed_count = $9, recomputed_at = $2
          where wave_id = $1 and dirty_generation = $10
            and lease_owner = $11 and lease_expires_at > clock_timestamp()
            and stale_at is not null and failed_at is null
          returning wave_id`,
        [
          claim.waveId,
          recomputedAt,
          counts.invited_count,
          counts.onboarding_started_count,
          counts.consented_count,
          counts.session_started_count,
          counts.session_completed_count,
          counts.session_abandoned_count,
          counts.delivery_failed_count,
          claim.dirtyGeneration,
          claim.leaseOwner,
        ],
      );
      if (published.rowCount !== 1)
        throw new Error('rollup lease was lost before publication');
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
    const result = await this.pool.query(
      `update study_wave_rollups
          set lease_owner = null,
              lease_expires_at = null,
              stale_at = case when $5::boolean then null
                              else clock_timestamp() + make_interval(secs => $6::float / 1000) end,
              failed_at = case when $5::boolean then clock_timestamp() else null end,
              last_error = $4
        where wave_id = $1
          and dirty_generation = $2
          and lease_owner = $3
          and lease_expires_at > clock_timestamp()`,
      [
        claim.waveId,
        claim.dirtyGeneration,
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
      `update study_wave_rollups
          set lease_owner = null, lease_expires_at = null, last_error = null,
              stale_at = null, attempt_count = 0, failed_at = null
        where wave_id = $1
          and dirty_generation = $2
          and lease_owner = $3
          and lease_expires_at > clock_timestamp()`,
      [claim.waveId, claim.dirtyGeneration, lease.owner],
    );
    return result.rowCount === 1;
  }

  async recordUncertain(
    claim: RollupClaim,
    lease: OutboxLease,
    error: unknown,
  ): Promise<boolean> {
    return this.recordFailure(claim, lease, error, null);
  }
}

function rollupDispatcher(pool: pg.Pool, options: MonitoringRollupOptions) {
  return new OutboxDispatcher({
    ...options,
    pool,
    adapter: new MonitoringRollupAdapter(pool, options.afterRecompute),
  });
}

/** Claims and recomputes at most one stale wave through shared dispatch semantics. */
export async function runMonitoringRollupOnce(
  pool: pg.Pool,
  options: MonitoringRollupOptions = {},
): Promise<{ claimed: number }> {
  const result = await rollupDispatcher(pool, options).runOnce();
  return { claimed: result.claimed };
}

/** One wave claim rebuilds both wave and stage projections. */
export function startMonitoringRollupWorker(options: {
  pool: pg.Pool;
  observer?: OutboxObserver;
  onError?: (error: unknown) => void | Promise<void>;
  pollIntervalMs?: number;
}): OutboxWorker {
  const dispatcher = rollupDispatcher(options.pool, options);
  return startOutboxWorker({
    queue: 'study_wave_rollups',
    pollIntervalMs: options.pollIntervalMs,
    observer: options.observer,
    onError: options.onError,
    runOnce: async () => dispatcher.runOnce(),
  });
}
