// Seeds the spike dataset via @codaco/protocol-utilities generateNetwork at
// 10× study scale:
//   - main workspace: 1 study × 3 waves × 7,000 participants = 21,000 sessions
//   - two noise workspaces: 2,000 single-wave sessions each
// Every session's network is an individual generateNetwork() output (~80
// nodes / ~220 edges; bounds <100 / <300). Rows land via COPY.
//
// FINDING: PostgreSQL refuses `COPY FROM` for any role subject to RLS
// ("COPY FROM not supported with row-level security", DoCopy) — including the
// FORCE-RLS table owner. Bulk load therefore runs as the superuser
// (BYPASSRLS); a production import path needs a dedicated maintenance role or
// INSERT-based batching. The app role's write path is exercised separately in
// bench.mjs.
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import { generateNetwork } from '@codaco/protocol-utilities';
import copyStreams from 'pg-copy-streams';

import { client, STUDIES, WORKSPACES } from './db.mjs';
import { codebook, generationConfig, stages } from './protocol.mjs';

const copyFrom = copyStreams.from;

const MAIN_PARTICIPANTS = Number(process.env.PARTICIPANTS ?? 7000);
const WAVES = 3;
const NOISE_SESSIONS = Number(process.env.NOISE_SESSIONS ?? 2000);
const CHUNK = 250; // sessions per COPY batch

const esc = (s) =>
  s.replaceAll('\\', '\\\\').replaceAll('\t', '\\t').replaceAll('\n', '\\n');
const jsonb = (v) => esc(JSON.stringify(v));

async function copyRows(db, sql, rows) {
  const stream = db.query(copyFrom(sql));
  await pipeline(async function* () {
    for (const row of rows) yield `${row}\n`;
  }, stream);
}

async function seedWorkspace(db, { workspaceId, studyId, participants, waves }) {
  await db.query(`SET app.workspace_id = '${workspaceId}'`);
  await db.query(`INSERT INTO workspaces (id) VALUES ($1)`, [workspaceId]);
  await db.query(
    `INSERT INTO studies (id, workspace_id) VALUES ($1, $2)`,
    [studyId, workspaceId],
  );

  const participantIds = Array.from({ length: participants }, () => randomUUID());
  let seedCounter = 0;
  let sessions = 0;

  for (let wave = 1; wave <= waves; wave++) {
    for (let start = 0; start < participantIds.length; start += CHUNK) {
      const batch = participantIds.slice(start, start + CHUNK);
      const sessionRows = [];
      const nodeRows = [];
      const edgeRows = [];

      for (const participantId of batch) {
        const sessionId = randomUUID();
        const { network } = generateNetwork({
          codebook,
          stages,
          seed: seedCounter++,
          config: generationConfig,
        });

        sessionRows.push(
          `${sessionId}\t${workspaceId}\t${studyId}\t${wave}\t${participantId}`,
        );
        for (const node of network.nodes) {
          nodeRows.push(
            `${workspaceId}\t${sessionId}\t${node._uid}\t${esc(node.type)}\t${jsonb(node.attributes)}`,
          );
        }
        for (const edge of network.edges) {
          edgeRows.push(
            `${workspaceId}\t${sessionId}\t${edge._uid}\t${esc(edge.type)}\t${edge.from}\t${edge.to}\t${jsonb(edge.attributes ?? {})}`,
          );
        }
      }

      await copyRows(
        db,
        `COPY sessions (id, workspace_id, study_id, wave, participant_id) FROM STDIN`,
        sessionRows,
      );
      await copyRows(
        db,
        `COPY nodes (workspace_id, session_id, node_id, type, attributes) FROM STDIN`,
        nodeRows,
      );
      await copyRows(
        db,
        `COPY edges (workspace_id, session_id, edge_id, type, from_node, to_node, attributes) FROM STDIN`,
        edgeRows,
      );
      sessions += batch.length;
    }
    console.log(`workspace ${workspaceId} wave ${wave}: ${sessions} sessions total`);
  }
}

const db = client('postgres');
await db.connect();
const t0 = performance.now();

await seedWorkspace(db, {
  workspaceId: WORKSPACES.main,
  studyId: STUDIES.main,
  participants: MAIN_PARTICIPANTS,
  waves: WAVES,
});
await seedWorkspace(db, {
  workspaceId: WORKSPACES.noiseA,
  studyId: STUDIES.noiseA,
  participants: NOISE_SESSIONS,
  waves: 1,
});
await seedWorkspace(db, {
  workspaceId: WORKSPACES.noiseB,
  studyId: STUDIES.noiseB,
  participants: NOISE_SESSIONS,
  waves: 1,
});

await db.query(`RESET app.workspace_id`);
await db.query(`ANALYZE sessions; ANALYZE nodes; ANALYZE edges;`);
await db.end();

// Verification counts via superuser (BYPASSRLS) — the owner connection above
// is subject to the forced policies and would see zero rows without context.
const su = client('postgres');
await su.connect();
const counts = await su.query(`
  SELECT (SELECT count(*) FROM sessions) AS sessions,
         (SELECT count(*) FROM nodes) AS nodes,
         (SELECT count(*) FROM edges) AS edges
`);
console.log('totals:', counts.rows[0], `in ${((performance.now() - t0) / 60000).toFixed(1)} min`);
await su.end();
