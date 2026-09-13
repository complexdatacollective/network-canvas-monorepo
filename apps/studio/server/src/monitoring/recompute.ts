import type pg from 'pg';

import type { OutboxObserver } from '../outbox/instrumentation.ts';
import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';

type RollupClaim = { waveId: string };

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
              exit_item->>'stageType' as stage_id,
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

async function claimWave(client: pg.PoolClient): Promise<RollupClaim | null> {
  const wave = await client.query<{ wave_id: string }>(
    `select wave_id
       from study_wave_rollups
      where stale_at is not null
      order by stale_at, wave_id
      for update skip locked
      limit 1`,
  );
  if (wave.rows[0]) return { waveId: wave.rows[0].wave_id };

  // A legacy erasure or a manually repaired stage row may have marked only a
  // stage stale. Claiming it still rebuilds the complete wave, which restores
  // the wave and stage worklists to one consistent point.
  const stage = await client.query<{ wave_id: string }>(
    `select wave_id
       from study_stage_rollups
      where stale_at is not null
      order by stale_at, wave_id
      for update skip locked
      limit 1`,
  );
  return stage.rows[0] ? { waveId: stage.rows[0].wave_id } : null;
}

/** Claims and recomputes at most one stale wave. A rollback leaves it stale. */
export async function runMonitoringRollupOnce(
  pool: pg.Pool,
): Promise<{ claimed: number }> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const claim = await claimWave(client);
    if (!claim) {
      await client.query('commit');
      return { claimed: 0 };
    }
    await recomputeWave(client, claim.waveId, new Date());
    await client.query('commit');
    return { claimed: 1 };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** One shared maintenance worker handles both the wave and stage worklists. */
export function startMonitoringRollupWorker(options: {
  pool: pg.Pool;
  observer?: OutboxObserver;
  onError?: (error: unknown) => void | Promise<void>;
  pollIntervalMs?: number;
}): OutboxWorker {
  return startOutboxWorker({
    queue: 'study_wave_rollups',
    pollIntervalMs: options.pollIntervalMs,
    observer: options.observer,
    onError: options.onError,
    runOnce: () => runMonitoringRollupOnce(options.pool),
  });
}
