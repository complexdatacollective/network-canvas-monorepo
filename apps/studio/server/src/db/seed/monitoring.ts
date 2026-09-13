// The monitoring aggregates, computed by SQL over the rows the seed has just
// written rather than invented alongside them. Nothing in these two tables is
// a source of truth — every value is recomputable — so a seeded number that
// disagreed with its detail view would be a bug the dashboard would show.
//
// `seed.test.ts` recomputes both tables with its own queries and compares, so
// the definitions below are the contract:
//
//   invited                = interview links issued for the wave
//   onboarding started     = distinct participants with a session in the wave
//   consented              = of those, the ones holding a live consent grant
//   session started        = sessions in the wave
//   session completed      = of those, status 'completed'
//   session abandoned      = of those, status 'abandoned'
//   delivery failed        = failed deliveries whose occurrence belongs to a
//                            schedule scoped to the wave
//
// and per (wave, stage), over the stages a session actually produced nodes or
// timing exits for:
//
//   entered                = observed stage intervals or node-producing stages
//   completed / abandoned  = of those, by session status
//   duration               = the runtime's recorded stage exit intervals,
//                            summed (sessions without timing contribute zero)
//   missing items          = nodes from that stage carrying no attributes
import type pg from 'pg';

export async function seedMonitoringRollups(
  client: pg.PoolClient,
  teamId: string,
  recomputedAt: Date,
): Promise<void> {
  await client.query(
    `insert into study_wave_rollups (
       team_id, study_id, wave_id, invited_count, onboarding_started_count,
       consented_count, session_started_count, session_completed_count,
       session_abandoned_count, delivery_failed_count, stale_at, recomputed_at)
     select
       w.team_id, w.study_id, w.id,
       (select count(*) from interview_links l
         where l.wave_id = w.id and l.team_id = w.team_id)::int,
       (select count(distinct s.participant_id) from interview_sessions s
         where s.wave_id = w.id and s.team_id = w.team_id
           and s.participant_id is not null)::int,
       (select count(distinct s.participant_id) from interview_sessions s
         join participant_consents pc
           on pc.participant_id = s.participant_id and pc.team_id = s.team_id
          and pc.withdrawn_at is null
         where s.wave_id = w.id and s.team_id = w.team_id)::int,
       (select count(*) from interview_sessions s
         where s.wave_id = w.id and s.team_id = w.team_id)::int,
       (select count(*) from interview_sessions s
         where s.wave_id = w.id and s.team_id = w.team_id
           and s.status = 'completed')::int,
       (select count(*) from interview_sessions s
         where s.wave_id = w.id and s.team_id = w.team_id
           and s.status = 'abandoned')::int,
       (select count(*) from message_deliveries d
         join schedule_occurrences o
           on o.id = d.occurrence_id and o.team_id = d.team_id
         join study_schedules sc
           on sc.id = o.schedule_id and sc.team_id = o.team_id
         where sc.wave_id = w.id and d.team_id = w.team_id
           and d.failed_at is not null)::int,
       null,
       $2
     from study_waves w
     where w.team_id = $1`,
    [teamId, recomputedAt],
  );

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
       where s.team_id = $1
     ),
     observed as (
       select s.team_id, s.study_id, s.wave_id, s.id as session_id,
              s.status, n.stage_id
       from interview_sessions s
       join nodes n on n.session_id = s.id and n.team_id = s.team_id
       where s.team_id = $1 and n.stage_id is not null
       group by s.team_id, s.study_id, s.wave_id, s.id, s.status, n.stage_id
       union
       select team_id, study_id, wave_id, session_id, status, stage_id
       from timing
     ),
     node_missing as (
       select s.wave_id, n.stage_id,
              count(*) filter (where n.attributes = '{}'::jsonb)::int as missing
       from interview_sessions s
       join nodes n on n.session_id = s.id and n.team_id = s.team_id
       where s.team_id = $1 and n.stage_id is not null
       group by s.wave_id, n.stage_id
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
     left join node_missing n
       on n.wave_id = o.wave_id and n.stage_id = o.stage_id
     group by o.team_id, o.study_id, o.wave_id, o.stage_id`,
    [teamId, recomputedAt],
  );
}
