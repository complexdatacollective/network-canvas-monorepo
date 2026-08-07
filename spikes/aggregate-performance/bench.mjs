// Benchmarks the three canonical aggregates AS THE APP ROLE (studio_app,
// non-owner, NOBYPASSRLS) with SET LOCAL tenant context inside each
// transaction, concurrent with pg-boss queue churn in the same database.
// Pass criterion (#1246): p95 < 1s per query.
import { PgBoss } from 'pg-boss';

import { client, pool, STUDIES, WORKSPACES } from './db.mjs';

const ITERATIONS = Number(process.env.ITERATIONS ?? 30);
const PORT = Number(process.env.PGPORT ?? 54318);

// --- The three canonical aggregates -------------------------------------
// Two tiers per the ADR: "raw" runs directly over the nodes/edges projection
// (best formulation found: per-session index-only work); "rollup" runs over
// the network layer's in-transaction per-session projections (rollups.mjs).

// 1. Degree distribution for (study, wave): histogram of node degree.
const DEGREE_DISTRIBUTION_RAW = `
  SELECT degree, count(*)::bigint AS nodes
  FROM sessions s
  CROSS JOIN LATERAL (
    SELECT coalesce(c.cnt, 0) AS degree
    FROM nodes n
    LEFT JOIN (
      SELECT node_id, count(*) AS cnt FROM (
        SELECT from_node AS node_id FROM edges
        WHERE workspace_id = s.workspace_id AND session_id = s.id
        UNION ALL
        SELECT to_node FROM edges
        WHERE workspace_id = s.workspace_id AND session_id = s.id
      ) ep GROUP BY node_id
    ) c ON c.node_id = n.node_id
    WHERE n.session_id = s.id
  ) d
  WHERE s.study_id = $1 AND s.wave = $2
  GROUP BY degree ORDER BY degree
`;

const DEGREE_DISTRIBUTION_ROLLUP = `
  SELECT h.degree, sum(h.node_count)::bigint AS nodes
  FROM session_degree_hist h
  JOIN session_stats st ON st.session_id = h.session_id
  WHERE st.study_id = $1 AND st.wave = $2
  GROUP BY h.degree ORDER BY h.degree
`;

// 2. Alter–alter tie counts per session (by edge type) for (study, wave).
const ALTER_ALTER_TIES = `
  SELECT e.session_id, e.type, count(*) AS ties
  FROM edges e
  JOIN sessions s ON s.id = e.session_id
  WHERE s.study_id = $1 AND s.wave = $2
  GROUP BY e.session_id, e.type
`;

// 3. Wave-over-wave comparison: per-wave tie volume and mean per-participant
//    change from the previous wave, across the whole study.
const WAVE_OVER_WAVE_RAW = `
  WITH per_session AS (
    SELECT s.participant_id, s.wave, coalesce(c.ties, 0) AS ties
    FROM sessions s
    LEFT JOIN LATERAL (
      SELECT count(*) AS ties FROM edges e WHERE e.session_id = s.id
    ) c ON true
    WHERE s.study_id = $1
  ),
  with_delta AS (
    SELECT wave, ties,
      ties - lag(ties) OVER (PARTITION BY participant_id ORDER BY wave) AS delta
    FROM per_session
  )
  SELECT wave,
    count(*) AS participants,
    avg(ties)::float AS mean_ties,
    avg(delta)::float AS mean_delta_vs_previous_wave
  FROM with_delta GROUP BY wave ORDER BY wave
`;

const WAVE_OVER_WAVE_ROLLUP = `
  WITH with_delta AS (
    SELECT wave, edge_count AS ties,
      edge_count - lag(edge_count) OVER (PARTITION BY participant_id ORDER BY wave) AS delta
    FROM session_stats WHERE study_id = $1
  )
  SELECT wave,
    count(*) AS participants,
    avg(ties)::float AS mean_ties,
    avg(delta)::float AS mean_delta_vs_previous_wave
  FROM with_delta GROUP BY wave ORDER BY wave
`;

// The write-path maintenance a session commit pays to keep the rollups
// transactional: rebuild one session's histogram row-set + stats row.
// Three statements, one transaction: data-modifying CTEs share a snapshot,
// so a DELETE+reINSERT of the same keys must be sequential statements.
const ROLLUP_UPSERT_STEPS = [
  `DELETE FROM session_degree_hist WHERE session_id = $1`,
  `INSERT INTO session_degree_hist (workspace_id, session_id, degree, node_count)
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
   WHERE s.id = $1
   GROUP BY s.workspace_id, s.id, d.degree`,
  `INSERT INTO session_stats (workspace_id, session_id, study_id, wave, participant_id, node_count, edge_count)
   SELECT s.workspace_id, s.id, s.study_id, s.wave, s.participant_id,
     (SELECT count(*) FROM nodes WHERE session_id = s.id),
     (SELECT count(*) FROM edges WHERE session_id = s.id)
   FROM sessions s WHERE s.id = $1
   ON CONFLICT (session_id) DO UPDATE
     SET node_count = excluded.node_count, edge_count = excluded.edge_count`,
];

// --- pg-boss churn -------------------------------------------------------

async function startChurn() {
  const boss = new PgBoss({
    host: '127.0.0.1',
    port: PORT,
    user: 'studio_owner',
    password: 'spike',
    database: 'studio_spike',
  });
  await boss.start();
  await boss.createQueue('spike-churn');
  let processed = 0;
  await boss.work('spike-churn', { batchSize: 10 }, async (jobs) => {
    processed += jobs.length;
    await new Promise((r) => setTimeout(r, 2));
  });
  let insertFailures = 0;
  const producer = setInterval(() => {
    const jobs = Array.from({ length: 20 }, (_, i) => ({
      data: { participant: i },
    }));
    boss.insert('spike-churn', jobs).catch(() => {
      insertFailures += 1;
    });
  }, 100);
  return {
    stop: async () => {
      clearInterval(producer);
      await boss.stop({ graceful: false });
      if (insertFailures > 0)
        console.warn(`churn producer: ${insertFailures} insert batches failed`);
      return processed;
    },
  };
}

// --- Measurement ---------------------------------------------------------

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    n: s.length,
    min: s[0].toFixed(0),
    p50: q(0.5).toFixed(0),
    p95: q(0.95).toFixed(0),
    max: s.at(-1).toFixed(0),
  };
}

async function timed(db, workspaceId, sql, params) {
  const conn = await db.connect();
  const t0 = performance.now();
  try {
    await conn.query('BEGIN');
    await conn.query(`SELECT set_config('app.workspace_id', $1, true)`, [
      workspaceId,
    ]);
    const res = await conn.query(sql, params);
    await conn.query('COMMIT');
    return { ms: performance.now() - t0, rows: res.rows };
  } finally {
    conn.release();
  }
}

const app = pool('studio_app', 10);

// Tenancy guards before benchmarking:
// (a) cross-tenant: noise workspace context querying the main study → 0 rows
const cross = await timed(app, WORKSPACES.noiseA, ALTER_ALTER_TIES, [
  STUDIES.main,
  1,
]);
if (cross.rows.length !== 0) throw new Error('RLS FAILURE: cross-tenant rows visible');
// (b) missing context → 0 rows (policy fails closed on NULL)
const noCtxConn = await app.connect();
const noCtx = await noCtxConn.query(`SELECT count(*)::int AS c FROM sessions`);
noCtxConn.release();
if (noCtx.rows[0].c !== 0) throw new Error('RLS FAILURE: rows visible without tenant context');
console.log('tenancy guards: cross-tenant and missing-context queries return zero rows ✓');

// (c) write path as the app role: an INSERT with matching tenant context
// passes the CHECK policy; an INSERT claiming another workspace is rejected.
{
  const conn = await app.connect();
  try {
    await conn.query('BEGIN');
    await conn.query(`SELECT set_config('app.workspace_id', $1, true)`, [
      WORKSPACES.main,
    ]);
    await conn.query(
      `INSERT INTO sessions (id, workspace_id, study_id, wave, participant_id)
       VALUES (gen_random_uuid(), $1, $2, 99, gen_random_uuid())`,
      [WORKSPACES.main, STUDIES.main],
    );
    let crossWriteRejected = false;
    try {
      await conn.query(
        `INSERT INTO sessions (id, workspace_id, study_id, wave, participant_id)
         VALUES (gen_random_uuid(), $1, $2, 99, gen_random_uuid())`,
        [WORKSPACES.noiseA, STUDIES.noiseA],
      );
    } catch (err) {
      crossWriteRejected = /row-level security/.test(String(err));
    }
    if (!crossWriteRejected)
      throw new Error('RLS FAILURE: cross-tenant INSERT was not rejected');
  } finally {
    await conn.query('ROLLBACK').catch(() => {});
    conn.release();
  }
  console.log('write guards: same-tenant INSERT passes, cross-tenant INSERT rejected by policy ✓');
}

const churn = await startChurn();
await new Promise((r) => setTimeout(r, 1500)); // let churn reach steady state

const queries = [
  ['degree_distribution_raw', DEGREE_DISTRIBUTION_RAW, [STUDIES.main, 2]],
  ['degree_distribution_rollup', DEGREE_DISTRIBUTION_ROLLUP, [STUDIES.main, 2]],
  ['alter_alter_ties', ALTER_ALTER_TIES, [STUDIES.main, 2]],
  ['wave_over_wave_raw', WAVE_OVER_WAVE_RAW, [STUDIES.main]],
  ['wave_over_wave_rollup', WAVE_OVER_WAVE_ROLLUP, [STUDIES.main]],
];

// The gate is evaluated on the tier the network layer would actually serve:
// rollup-backed degree/wave queries, raw tie counts.
const GATE_QUERIES = new Set([
  'degree_distribution_rollup',
  'alter_alter_ties',
  'wave_over_wave_rollup',
]);

// Warm-up (one of each, excluded from stats)
for (const [, sql, params] of queries) {
  await timed(app, WORKSPACES.main, sql, params);
}

const samples = Object.fromEntries(queries.map(([name]) => [name, []]));
for (let i = 0; i < ITERATIONS; i++) {
  for (const [name, sql, params] of queries) {
    const { ms } = await timed(app, WORKSPACES.main, sql, params);
    samples[name].push(ms);
  }
}

// Write-path rollup maintenance cost, measured per session as the app role.
const sessionIds = await timed(
  app,
  WORKSPACES.main,
  `SELECT id FROM sessions WHERE study_id = $1 AND wave = 2 ORDER BY random() LIMIT 50`,
  [STUDIES.main],
);
const upsertSamples = [];
for (const row of sessionIds.rows) {
  const conn = await app.connect();
  const t0 = performance.now();
  try {
    await conn.query('BEGIN');
    await conn.query(`SELECT set_config('app.workspace_id', $1, true)`, [
      WORKSPACES.main,
    ]);
    for (const sql of ROLLUP_UPSERT_STEPS) {
      await conn.query(sql, [row.id]);
    }
    await conn.query('COMMIT');
    upsertSamples.push(performance.now() - t0);
  } finally {
    conn.release();
  }
}

const jobsProcessed = await churn.stop();
console.log(`\npg-boss churn during run: ${jobsProcessed} jobs processed`);
console.log(`\nlatency (ms) over ${ITERATIONS} iterations, as studio_app under forced RLS:`);
let pass = true;
for (const [name] of queries) {
  const st = stats(samples[name]);
  const gated = GATE_QUERIES.has(name);
  const ok = Number(st.p95) < 1000;
  if (gated) pass &&= ok;
  console.log(
    `  ${name.padEnd(28)} p50=${st.p50}  p95=${st.p95}  min=${st.min}  max=${st.max}  ${gated ? (ok ? 'PASS' : 'FAIL') : '(informational)'}`,
  );
}
const up = stats(upsertSamples);
console.log(`  ${'rollup_upsert_per_session'.padEnd(28)} p50=${up.p50}  p95=${up.p95}  min=${up.min}  max=${up.max}  (write-path cost)`);
console.log(`\ngate (p95 < 1000 ms for the three canonical aggregates, rollup tier): ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
await app.end();
process.exit(pass ? 0 : 1);
