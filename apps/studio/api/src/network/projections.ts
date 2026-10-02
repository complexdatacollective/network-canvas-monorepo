import { and, eq, inArray } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { NETWORK_TABLES } from './schema.ts';

const { sessionDegreeHist } = NETWORK_TABLES;

const DEGREE_HISTOGRAM_SQL = `INSERT INTO session_degree_hist (team_id, session_id, degree, node_count)
   SELECT s.team_id, s.id, d.degree, count(*)::int
   FROM interview_sessions s
   CROSS JOIN LATERAL (
     SELECT coalesce(c.cnt, 0) AS degree
     FROM nodes n
     LEFT JOIN (
       SELECT node_id, count(*) AS cnt FROM (
         SELECT from_node AS node_id FROM edges WHERE session_id = s.id
         UNION ALL
         SELECT to_node FROM edges WHERE session_id = s.id
       ) ep GROUP BY node_id
     ) c ON c.node_id = n.node_id
     WHERE n.session_id = s.id
   ) d
   WHERE s.team_id = $1 AND s.id = ANY($2::uuid[])
   GROUP BY s.team_id, s.id, d.degree`;

const SESSION_STATS_SQL = `INSERT INTO session_stats (team_id, session_id, study_id, wave_id, wave_number,
                             participant_id, node_count, edge_count, computed_at)
   SELECT s.team_id, s.id, s.study_id, s.wave_id, w.wave_number, s.participant_id,
          (SELECT count(*) FROM nodes WHERE session_id = s.id),
          (SELECT count(*) FROM edges WHERE session_id = s.id),
          statement_timestamp()
   FROM interview_sessions s
   JOIN study_waves w ON w.id = s.wave_id AND w.team_id = s.team_id
   WHERE s.team_id = $1 AND s.id = ANY($2::uuid[])
   ON CONFLICT (session_id) DO UPDATE
     SET node_count = excluded.node_count,
         edge_count = excluded.edge_count,
         computed_at = excluded.computed_at`;

/**
 * The delete and the reinsert must be separate statements: data-modifying CTEs
 * share one snapshot.
 */
export const refreshProjectionsForSessions: (ids: {
  teamId: string;
  sessionIds: readonly string[];
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'network.projections.refreshProjectionsForSessions',
)(function* (ids: { teamId: string; sessionIds: readonly string[] }) {
  if (ids.sessionIds.length === 0) return;
  const { tx, sql } = yield* Transaction;
  const sessionIds = [...ids.sessionIds];

  yield* tx
    .delete(sessionDegreeHist)
    .where(
      and(
        eq(sessionDegreeHist.teamId, ids.teamId),
        inArray(sessionDegreeHist.sessionId, sessionIds),
      ),
    );

  yield* sql.unsafe(DEGREE_HISTOGRAM_SQL, [ids.teamId, sessionIds]);
  yield* sql.unsafe(SESSION_STATS_SQL, [ids.teamId, sessionIds]);
}, sqlErrorsOnly);

export const refreshSessionProjections: (ids: {
  teamId: string;
  sessionId: string;
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = (ids) =>
  refreshProjectionsForSessions({
    teamId: ids.teamId,
    sessionIds: [ids.sessionId],
  });
