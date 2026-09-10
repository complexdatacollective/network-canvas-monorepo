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
// and per (wave, stage), over the stages a session actually produced nodes on:
//
//   entered                = sessions of the wave with a node from that stage
//   completed / abandoned  = of those, by session status
//   duration               = each session's elapsed time divided evenly across
//                            the stages it entered, summed
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
     with session_stage as (
       select s.team_id, s.study_id, s.wave_id, s.id as session_id, s.status,
              n.stage_id,
              count(*) filter (where n.attributes = '{}'::jsonb) as missing_items,
              (extract(epoch from (s.last_activity_at - s.started_at)) * 1000)::bigint
                as elapsed_ms
       from interview_sessions s
       join nodes n on n.session_id = s.id and n.team_id = s.team_id
       where s.team_id = $1 and n.stage_id is not null
       group by s.team_id, s.study_id, s.wave_id, s.id, s.status, n.stage_id,
                s.started_at, s.last_activity_at
     ),
     stages_per_session as (
       select session_id, count(*) as stage_count
       from session_stage group by session_id
     )
     select ss.team_id, ss.study_id, ss.wave_id, ss.stage_id,
            count(*)::int,
            count(*) filter (where ss.status = 'completed')::int,
            count(*) filter (where ss.status = 'abandoned')::int,
            sum(ss.elapsed_ms / sp.stage_count)::bigint,
            count(*)::int,
            sum(ss.missing_items)::int,
            null,
            $2
     from session_stage ss
     join stages_per_session sp on sp.session_id = ss.session_id
     group by ss.team_id, ss.study_id, ss.wave_id, ss.stage_id`,
    [teamId, recomputedAt],
  );
}
