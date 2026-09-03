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
import type pg from 'pg';

/**
 * Recomputes one session's rollups from its rows, inside the caller's
 * transaction. Takes a client rather than a pool for exactly that reason: the
 * projections are only correct if they commit with the write that changed the
 * graph.
 *
 * The delete and the reinsert must be separate statements — data-modifying
 * CTEs share one snapshot, so a delete-then-reinsert of the same keys cannot
 * be a single statement.
 */
export async function refreshSessionProjections(
  client: pg.ClientBase,
  ids: { teamId: string; sessionId: string },
): Promise<void> {
  const values = [ids.teamId, ids.sessionId];

  await client.query(
    `DELETE FROM session_degree_hist WHERE team_id = $1 AND session_id = $2`,
    values,
  );

  // One lateral row per node, carrying that node's degree; the outer grouping
  // turns those into the distribution. `count(*) = 0` nodes are kept, which is
  // what makes the histogram sum to the node count.
  await client.query(
    `INSERT INTO session_degree_hist (team_id, session_id, degree, node_count)
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
     WHERE s.team_id = $1 AND s.id = $2
     GROUP BY s.team_id, s.id, d.degree`,
    values,
  );

  await client.query(
    `INSERT INTO session_stats (team_id, session_id, study_id, wave_id, wave_number,
                                participant_id, node_count, edge_count, computed_at)
     SELECT s.team_id, s.id, s.study_id, s.wave_id, w.wave_number, s.participant_id,
            (SELECT count(*) FROM nodes WHERE session_id = s.id),
            (SELECT count(*) FROM edges WHERE session_id = s.id),
            statement_timestamp()
     FROM interview_sessions s
     JOIN study_waves w ON w.id = s.wave_id AND w.team_id = s.team_id
     WHERE s.team_id = $1 AND s.id = $2
     ON CONFLICT (session_id) DO UPDATE
       SET node_count = excluded.node_count,
           edge_count = excluded.edge_count,
           computed_at = excluded.computed_at`,
    values,
  );
}
