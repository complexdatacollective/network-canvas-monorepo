// Rollup tier — the ADR's pre-approved "contained answer inside the network
// layer" (#1246): per-session projections maintained in the same transaction
// as the session write. Here: per-session stats and a per-session degree
// histogram. Backfill runs once as superuser; steady-state maintenance cost
// (the per-session upsert the write path would pay) is measured in bench.mjs.
import { client } from './db.mjs';

const db = client('postgres');
await db.connect();

await db.query(`
DROP TABLE IF EXISTS session_stats, session_degree_hist;

CREATE TABLE session_stats (
  workspace_id uuid NOT NULL,
  session_id uuid PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
  study_id uuid NOT NULL,
  wave int NOT NULL,
  participant_id uuid NOT NULL,
  node_count int NOT NULL,
  edge_count int NOT NULL
);
CREATE INDEX session_stats_ws_study_wave ON session_stats (workspace_id, study_id, wave);

CREATE TABLE session_degree_hist (
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  degree int NOT NULL,
  node_count int NOT NULL,
  PRIMARY KEY (session_id, degree)
);
CREATE INDEX session_degree_hist_ws ON session_degree_hist (workspace_id, session_id);
`);

for (const table of ['session_stats', 'session_degree_hist']) {
  await db.query(`
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${table}
      FOR ALL
      USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO studio_app;
  `);
}

console.log('backfilling session_stats…');
let t0 = performance.now();
await db.query(`
  INSERT INTO session_stats
  SELECT s.workspace_id, s.id, s.study_id, s.wave, s.participant_id,
         coalesce(n.c, 0), coalesce(e.c, 0)
  FROM sessions s
  LEFT JOIN LATERAL (SELECT count(*) c FROM nodes WHERE session_id = s.id) n ON true
  LEFT JOIN LATERAL (SELECT count(*) c FROM edges WHERE session_id = s.id) e ON true
`);
console.log(`  ${((performance.now() - t0) / 1000).toFixed(1)}s`);

console.log('backfilling session_degree_hist…');
t0 = performance.now();
await db.query(`
  INSERT INTO session_degree_hist
  SELECT s.workspace_id, s.id, d.degree, count(*)::int
  FROM sessions s
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
  GROUP BY s.workspace_id, s.id, d.degree
`);
console.log(`  ${((performance.now() - t0) / 1000).toFixed(1)}s`);

await db.query(`ANALYZE session_stats; ANALYZE session_degree_hist;`);
const counts = await db.query(
  `SELECT (SELECT count(*) FROM session_stats) AS stats,
          (SELECT count(*) FROM session_degree_hist) AS hist`,
);
console.log('rollup rows:', counts.rows[0]);
await db.end();
