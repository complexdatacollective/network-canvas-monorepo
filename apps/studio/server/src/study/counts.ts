import type pg from 'pg';

import type { StudyCounts } from '@codaco/studio-rpc';
import type { TenantDb } from '@codaco/studio-sync/tenant';

// The numbers the study sidebar carries beside its countable destinations
// (app-shell design §5.5): published versions, participants, waves, sessions.

/**
 * All four counts in ONE statement, driven off the study row.
 *
 * One query rather than four because the four numbers are read together and
 * shown together: separate statements would be four round trips, each in its
 * own transaction, so a wave created between the second and the third would
 * produce a sidebar whose rows disagree about which study they are describing.
 * Reading them as correlated subqueries over the single `studies` row also
 * makes the study's existence and the counts one answer — an absent row is an
 * empty result rather than four zeroes indistinguishable from a real empty
 * study.
 *
 * `versions` counts the study's PROTOCOL LINE, through `studies.protocol_id`,
 * because that is what the Versions destination lists. A `protocol_versions`
 * row exists only once a version is published, so the row count is the
 * published count; a Draft study whose `protocol_id` is still null matches
 * nothing and counts zero, which is the true answer rather than a null.
 *
 * Every subquery carries its own `team_id` predicate as well as running under
 * row-level security, following the rest of the data layer: the predicates
 * lead the team-first indexes, and they hold even where RLS is bypassed.
 */
export async function readStudyCounts(
  db: TenantDb,
  studyId: string,
): Promise<StudyCounts | undefined> {
  // `TenantDb.query` returns an untyped `pg.QueryResult`, so the row shape is
  // named on the way out rather than asserted afterwards. The `::int` casts
  // below are what make the shape true: `count(*)` is a bigint, which `pg`
  // hands back as a string unless it is narrowed in SQL first.
  const result: pg.QueryResult<StudyCounts> = await db.query(
    `SELECT
       (SELECT count(*)::int FROM protocol_versions v
         WHERE v.team_id = s.team_id AND v.protocol_id = s.protocol_id)
         AS versions,
       (SELECT count(*)::int FROM participants p
         WHERE p.team_id = s.team_id AND p.study_id = s.id)
         AS participants,
       (SELECT count(*)::int FROM study_waves w
         WHERE w.team_id = s.team_id AND w.study_id = s.id)
         AS waves,
       (SELECT count(*)::int FROM interview_sessions i
         WHERE i.team_id = s.team_id AND i.study_id = s.id)
         AS sessions
     FROM studies s
     WHERE s.id = $1 AND s.team_id = $2`,
    [studyId, db.teamId],
  );

  // Undefined for a study this team does not have — which, under row-level
  // security, is also every study another team does have.
  return result.rows[0];
}
