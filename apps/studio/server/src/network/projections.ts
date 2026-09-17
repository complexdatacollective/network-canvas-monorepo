// The only writer of `session_stats` and `session_degree_hist`.
//
// The projections are maintained by application code rather than by a database
// trigger, deliberately (design S6). The reasons, in order:
//
//  1. The ADR already assigns the responsibility to this layer: Postgres
//     materializes nodes and edges into relational projection tables *in the
//     same transaction* as the document write, and the network module is
//     already the single module that owns every such write.
//  2. A row-level trigger would fire once per node and per edge rather than
//     once per commit — a categorically worse cost profile than the two to
//     three milliseconds per session commit the three statements below were
//     measured at. A statement-level trigger would recompute twice for a delta
//     that touches nodes and edges in separate statements.
//  3. This codebase's triggers carry promises that must survive application
//     bugs — immutability, tenancy, closedness. A stale rollup is a
//     correctness bug a recompute repairs, not a safety breach, and the
//     data-rights work already requires a recompute path that must exist as
//     application code regardless.
//  4. The projections are per-session, so participant erasure's recompute is
//     "delete the erased participant's rollup rows" — no aggregate is rebuilt
//     at all. That property only holds because the projection grain is the
//     session.
//
// The obligation this creates is met by two tests: `__tests__/boundary.test.ts`
// pins `src/network/` as the only importer of these tables, and
// `__tests__/projections.test.ts` asserts the rollups agree with `nodes` and
// `edges` after every call — and fails when the call is removed.
import { and, eq, inArray } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';
import type pg from 'pg';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { NETWORK_TABLES } from './schema.ts';

const { sessionDegreeHist } = NETWORK_TABLES;

/**
 * The degree distribution of every named session.
 *
 * Raw rather than built: one lateral row per node carrying that node's degree,
 * from a correlated derived table over a UNION ALL of both edge endpoints,
 * grouped by the outer session. `CROSS JOIN LATERAL` over a correlated
 * subquery is not something the builder can render, and neither is the
 * `INSERT … SELECT` around it.
 *
 * `count(*) = 0` nodes are kept, which is what makes the histogram sum to the
 * node count.
 *
 * `$1` is the team and `$2` the session ids, bound as one array rather than
 * spliced: a bare interpolation would flatten the list into the statement text
 * and change its shape with the number of sessions. Reads no timestamp or date
 * column, and returns no rows.
 */
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

/**
 * The per-session counts, upserted.
 *
 * Raw rather than built for two reasons at once: it is an `INSERT … SELECT`
 * over a join, and its conflict action reads `excluded.*` — neither of which
 * the builder can render.
 *
 * `computed_at` is written by `statement_timestamp()` in the database rather
 * than from a JavaScript `Date`, so the column records when the projection was
 * computed by the transaction that changed the graph. Nothing is read back
 * here, so the raw path's epoch-millisecond decoding of `timestamptz` never
 * arises.
 *
 * `$1` is the team and `$2` the session ids. Returns no rows.
 */
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
 * The same recompute over a set of sessions of one team, in the same three
 * statements: the bulk paths (a seed, an import) write hundreds of sessions
 * per transaction, and three round trips per session was most of what they
 * spent.
 *
 * Runs inside the caller's transaction — it requires one rather than opening
 * one — for the reason this module exists: the projections are only correct if
 * they commit with the write that changed the graph.
 *
 * The delete and the reinsert must be separate statements: data-modifying CTEs
 * share one snapshot, so a delete-then-reinsert of the same keys cannot be a
 * single statement. And they are three statements for the whole set rather
 * than three per session. `SqlClient` names a nested transaction
 * `SAVEPOINT effect_sql_<depth>` and emits no `RELEASE` on success, so a bulk
 * path that opened a scope per row would leave one savepoint per session
 * standing for the length of the transaction.
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

  // Built. No `.returning()`: nothing reads the outcome — every degree row for
  // these sessions is about to be rewritten — so there is no branch a
  // miscounted result could invert.
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

/**
 * The delete the Effect path above builds, as statement text.
 *
 * Only the node-postgres path below uses it: that path has no builder to
 * render through, because the builder it would need is bound to an Effect
 * transaction it is not running in.
 */
const DELETE_DEGREE_HISTOGRAM_SQL = `DELETE FROM session_degree_hist
   WHERE team_id = $1 AND session_id = ANY($2::uuid[])`;

/**
 * The same three statements against a node-postgres client, for the seed.
 *
 * The seed writes its whole run inside one `pg` transaction, and the rows it
 * projects — the teams, studies, waves and sessions those statements read —
 * are uncommitted for the length of it. A statement issued on any other
 * connection cannot see them, so the Effect path above is not merely
 * inconvenient here but wrong: `@effect/sql-pg` speaks the wire protocol
 * itself and cannot adopt an open `pg` connection, so an Effect transaction
 * would be a second connection reading a snapshot the seed's rows are not in.
 * The seed stays on node-postgres for the reason #1927 §9 gives (drizzle-kit's
 * `pushSchema` has no Effect driver), and this is its path to the same three
 * statements.
 *
 * It lives here rather than in `db/seed/network.ts` because ADR #1246 makes
 * `src/network/` the only directory permitted to touch the rollup tables, and
 * `__tests__/boundary.test.ts` enforces that.
 */
export const refreshProjectionsForSessionsOnClient = async (
  client: pg.ClientBase,
  ids: { teamId: string; sessionIds: readonly string[] },
): Promise<void> => {
  if (ids.sessionIds.length === 0) return;
  const sessionIds = [...ids.sessionIds];
  await client.query(DELETE_DEGREE_HISTOGRAM_SQL, [ids.teamId, sessionIds]);
  await client.query(DEGREE_HISTOGRAM_SQL, [ids.teamId, sessionIds]);
  await client.query(SESSION_STATS_SQL, [ids.teamId, sessionIds]);
};

/** Recomputes one session's rollups from its rows, inside the caller's transaction. */
export const refreshSessionProjections: (ids: {
  teamId: string;
  sessionId: string;
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = (ids) =>
  refreshProjectionsForSessions({
    teamId: ids.teamId,
    sessionIds: [ids.sessionId],
  });
