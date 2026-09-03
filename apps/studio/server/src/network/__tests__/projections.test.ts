// The rollup tables are maintained by application code rather than by a
// database trigger (design S6), so the agreement between `session_stats`,
// `session_degree_hist` and the rows they summarize is a property this suite
// has to prove rather than one the database enforces.
//
// Every case therefore carries its own oracle: the counts are read before the
// refresh as well as after, so a `refreshSessionProjections` that stopped
// writing — or that wrote the wrong distribution — cannot pass as "no error".
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { refreshSessionProjections } from '../projections.ts';

const db = await reachableDb();

const TEAM = 'team-a';

type Row = Record<string, unknown>;
type Degrees = Record<number, number>;

describe.skipIf(!db)('session projections', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;
  let tenant: TenantDb;
  let versionId: string;

  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  /** A study, a wave, a participant and an in-progress session for them. */
  async function newSession(): Promise<string> {
    const studyId = randomUUID();
    const waveId = randomUUID();
    const participantId = randomUUID();
    const sessionId = randomUUID();
    await insert('studies', { id: studyId, team_id: TEAM, name: 'A study' });
    await insert('study_waves', {
      id: waveId,
      study_id: studyId,
      team_id: TEAM,
      wave_number: 1,
    });
    await insert('participants', {
      id: participantId,
      study_id: studyId,
      team_id: TEAM,
      participant_code: `P-${participantId.slice(0, 8)}`,
    });
    await insert('interview_sessions', {
      id: sessionId,
      study_id: studyId,
      team_id: TEAM,
      wave_id: waveId,
      participant_id: participantId,
      protocol_version_id: versionId,
      ego_uid: `ego_${sessionId.slice(0, 8)}`,
    });
    return sessionId;
  }

  const addNode = (sessionId: string, nodeId: string) =>
    insert('nodes', {
      team_id: TEAM,
      session_id: sessionId,
      node_id: nodeId,
      type: 'person',
    });

  const addEdge = (sessionId: string, from: string, to: string) =>
    insert('edges', {
      team_id: TEAM,
      session_id: sessionId,
      edge_id: `${from}-${to}`,
      type: 'friend',
      from_node: from,
      to_node: to,
    });

  const refresh = (sessionId: string) =>
    tenant.transaction((client) =>
      refreshSessionProjections(client, { teamId: TEAM, sessionId }),
    );

  async function readStats(sessionId: string): Promise<Row | undefined> {
    const rows = await pool.query<Row>(
      `SELECT node_count, edge_count, study_id, wave_id, wave_number,
              participant_id, computed_at
       FROM session_stats WHERE session_id = $1`,
      [sessionId],
    );
    return rows.rows[0];
  }

  async function readDegrees(sessionId: string): Promise<Degrees> {
    const rows = await pool.query<{ degree: number; node_count: number }>(
      `SELECT degree, node_count FROM session_degree_hist
       WHERE session_id = $1 ORDER BY degree`,
      [sessionId],
    );
    return Object.fromEntries(
      rows.rows.map(({ degree, node_count }) => [degree, node_count]),
    );
  }

  /** The truth the projections are supposed to agree with. */
  async function readActualCounts(
    sessionId: string,
  ): Promise<{ nodes: number; edges: number }> {
    const counts = await pool.query<{ nodes: number; edges: number }>(
      `SELECT (SELECT count(*)::int FROM nodes WHERE session_id = $1) AS nodes,
              (SELECT count(*)::int FROM edges WHERE session_id = $1) AS edges`,
      [sessionId],
    );
    const row = counts.rows[0];
    if (!row) throw new Error('unreachable: scalar subqueries always return');
    return row;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM);
    const protocolId = randomUUID();
    versionId = randomUUID();
    await insert('protocols', {
      id: protocolId,
      team_id: TEAM,
      name: 'protocol',
    });
    await insert('protocol_versions', {
      id: versionId,
      protocol_id: protocolId,
      team_id: TEAM,
      version_number: 1,
      version_hash: 'hash',
      manifest: JSON.stringify({ name: 'protocol' }),
      schema_version: 8,
      source_manifest_hash: 'source',
    });
    tenant = createTenantDb(app, TEAM);
  });
  afterAll(async () => {
    await dispose();
  });

  it('agrees with the rows it summarizes, and only after the call', async () => {
    const sessionId = await newSession();
    // a-b, b-c over four nodes: degrees a=1, b=2, c=1, d=0.
    for (const node of ['a', 'b', 'c', 'd']) await addNode(sessionId, node);
    await addEdge(sessionId, 'a', 'b');
    await addEdge(sessionId, 'b', 'c');

    // The oracle: nothing maintains these tables but the call below, so before
    // it there is no row at all. A trigger doing the work would fail here.
    expect(await readStats(sessionId)).toBeUndefined();
    expect(await readDegrees(sessionId)).toEqual({});

    await refresh(sessionId);

    const actual = await readActualCounts(sessionId);
    expect(actual).toEqual({ nodes: 4, edges: 2 });
    expect(await readStats(sessionId)).toMatchObject({
      node_count: actual.nodes,
      edge_count: actual.edges,
      wave_number: 1,
    });

    const degrees = await readDegrees(sessionId);
    expect(degrees).toEqual({ 0: 1, 1: 2, 2: 1 });
    // Every node is counted exactly once, isolates included.
    expect(Object.values(degrees).reduce((a, b) => a + b, 0)).toBe(
      actual.nodes,
    );
  });

  it('leaves the rollups stale until the next call, then updates them', async () => {
    const sessionId = await newSession();
    for (const node of ['a', 'b', 'c', 'd']) await addNode(sessionId, node);
    await addEdge(sessionId, 'a', 'b');
    await addEdge(sessionId, 'b', 'c');
    await refresh(sessionId);
    expect(await readDegrees(sessionId)).toEqual({ 0: 1, 1: 2, 2: 1 });

    await addEdge(sessionId, 'c', 'd');

    // The stale window is the oracle for the second half: the write alone does
    // not maintain the projection, so a caller that forgets the refresh ships
    // wrong numbers rather than an error.
    expect(await readStats(sessionId)).toMatchObject({
      node_count: 4,
      edge_count: 2,
    });
    expect(await readDegrees(sessionId)).toEqual({ 0: 1, 1: 2, 2: 1 });

    await refresh(sessionId);

    const actual = await readActualCounts(sessionId);
    expect(actual).toEqual({ nodes: 4, edges: 3 });
    expect(await readStats(sessionId)).toMatchObject({
      node_count: 4,
      edge_count: 3,
    });
    // a=1, b=2, c=2, d=1: the degree-0 bucket is gone rather than left behind,
    // which is what the delete-then-reinsert exists for.
    expect(await readDegrees(sessionId)).toEqual({ 1: 2, 2: 2 });
  });

  it('moves computed_at forward on every refresh', async () => {
    const sessionId = await newSession();
    await addNode(sessionId, 'a');
    await refresh(sessionId);
    const first = (await readStats(sessionId))?.computed_at;

    await addNode(sessionId, 'b');
    await refresh(sessionId);
    const second = (await readStats(sessionId))?.computed_at;

    expect(first).toBeInstanceOf(Date);
    expect(second).toBeInstanceOf(Date);
    expect((second as Date).getTime()).toBeGreaterThan(
      (first as Date).getTime(),
    );
    expect(await readStats(sessionId)).toMatchObject({ node_count: 2 });
  });

  it('summarizes an empty session as zero rather than as nothing', async () => {
    const sessionId = await newSession();
    await refresh(sessionId);

    expect(await readStats(sessionId)).toMatchObject({
      node_count: 0,
      edge_count: 0,
    });
    // No node has a degree, so the histogram is empty — the counts check on
    // `session_degree_hist` forbids a zero-node bucket.
    expect(await readDegrees(sessionId)).toEqual({});
  });

  it('keeps one session out of the next session rollup', async () => {
    const first = await newSession();
    const second = await newSession();
    for (const node of ['a', 'b']) await addNode(first, node);
    await addEdge(first, 'a', 'b');
    await addNode(second, 'a');

    await refresh(first);
    await refresh(second);

    expect(await readStats(first)).toMatchObject({
      node_count: 2,
      edge_count: 1,
    });
    expect(await readStats(second)).toMatchObject({
      node_count: 1,
      edge_count: 0,
    });
    expect(await readDegrees(second)).toEqual({ 0: 1 });
  });
});
