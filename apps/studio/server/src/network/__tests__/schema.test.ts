// The network module's database-enforced promises: every CHECK, the composite
// foreign keys that prove same-team membership, the endpoint keys that make a
// dangling edge impossible, the snapshot's write-once-at-finalization rule and
// the deferred constraint that makes it compulsory, and the statement-level
// guard that makes a finalized session's and a closed study's collected data
// read-only.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger,
// the SQLSTATE for a policy — so a guard that stopped firing cannot pass as
// "no error".
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { ERASURE_GUC } from '../../study/schema.ts';
import { refreshSessionProjections } from '../projections.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

const FINALIZE_SQL = `UPDATE interview_sessions
   SET status = 'completed', completed_at = now() WHERE id = $1`;

type Row = Record<string, unknown>;

/** A study, its wave, its participant and one in-progress session for them. */
type Fixture = {
  studyId: string;
  waveId: string;
  participantId: string;
  sessionId: string;
};

describe.skipIf(!db)('network schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  const protocolOf: Record<string, string> = {};
  const versionOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` and `maintenance`
  // pools instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  async function newFixture(teamId = TEAM_A): Promise<Fixture> {
    const studyId = randomUUID();
    const waveId = randomUUID();
    const participantId = randomUUID();
    const sessionId = randomUUID();
    // The study names its team's protocol line and the wave pins that line's
    // published version, because `study_waves_version_own_line` refuses a pin
    // whose study has no line and `interview_sessions_version_wave_pin`
    // refuses a session under a wave that pins nothing.
    await insert('studies', {
      id: studyId,
      team_id: teamId,
      name: 'A study',
      protocol_id: protocolOf[teamId],
    });
    await insert('study_waves', {
      id: waveId,
      study_id: studyId,
      team_id: teamId,
      wave_number: 1,
      protocol_version_id: versionOf[teamId],
    });
    await insert('participants', {
      id: participantId,
      study_id: studyId,
      team_id: teamId,
      participant_code: `P-${participantId.slice(0, 8)}`,
    });
    await insert('interview_sessions', {
      id: sessionId,
      study_id: studyId,
      team_id: teamId,
      wave_id: waveId,
      participant_id: participantId,
      protocol_version_id: versionOf[teamId],
      ego_uid: `ego_${sessionId.slice(0, 8)}`,
    });
    return { studyId, waveId, participantId, sessionId };
  }

  const nodeRow = (sessionId: string, overrides: Row = {}): Row => ({
    team_id: TEAM_A,
    session_id: sessionId,
    node_id: `node_${randomUUID().slice(0, 8)}`,
    type: 'person',
    ...overrides,
  });

  const edgeRow = (
    sessionId: string,
    fromNode: string,
    toNode: string,
    overrides: Row = {},
  ): Row => ({
    team_id: TEAM_A,
    session_id: sessionId,
    edge_id: `edge_${randomUUID().slice(0, 8)}`,
    type: 'friend',
    from_node: fromNode,
    to_node: toNode,
    ...overrides,
  });

  const snapshotRow = (fixture: Fixture, overrides: Row = {}): Row => ({
    session_id: fixture.sessionId,
    team_id: TEAM_A,
    study_id: fixture.studyId,
    protocol_version_id: versionOf[TEAM_A],
    schema_version: 8,
    payload: JSON.stringify({ nodes: [], edges: [], ego: {} }),
    payload_hash: 'sha256:deadbeef',
    ...overrides,
  });

  const statsRow = (fixture: Fixture, overrides: Row = {}): Row => ({
    team_id: TEAM_A,
    session_id: fixture.sessionId,
    study_id: fixture.studyId,
    wave_id: fixture.waveId,
    wave_number: 1,
    participant_id: fixture.participantId,
    node_count: 0,
    edge_count: 0,
    ...overrides,
  });

  const histRow = (fixture: Fixture, overrides: Row = {}): Row => ({
    team_id: TEAM_A,
    session_id: fixture.sessionId,
    degree: 0,
    node_count: 1,
    ...overrides,
  });

  /** Adds a node to `sessionId` and returns its network-local id. */
  async function newNode(sessionId: string, overrides: Row = {}) {
    const row = nodeRow(sessionId, overrides);
    await insert('nodes', row);
    return row.node_id as string;
  }

  async function closeStudy(studyId: string): Promise<void> {
    await pool.query(
      `UPDATE studies SET state = 'closed', closed_at = now() WHERE id = $1`,
      [studyId],
    );
  }

  /**
   * The snapshot a finalization has to write, derived from the session so any
   * fixture can be finalized without naming its study or its version pin.
   */
  const SNAPSHOT_SQL = `INSERT INTO session_snapshots
       (session_id, team_id, study_id, protocol_version_id,
        schema_version, payload, payload_hash)
     SELECT s.id, s.team_id, s.study_id, s.protocol_version_id,
            v.schema_version, '{}'::jsonb, 'sha256:finalized'
     FROM interview_sessions s
     JOIN protocol_versions v
       ON v.id = s.protocol_version_id AND v.team_id = s.team_id
     WHERE s.id = $1`;

  /**
   * Finalizes `sessionId` in its own committed transaction, snapshot and all:
   * `interview_sessions_completion_snapshot` is deferred to commit, so the
   * flip and the snapshot have to travel together.
   */
  const finalize = (sessionId: string) =>
    finalizing(sessionId, (client) => client.query(SNAPSHOT_SQL, [sessionId]));

  /**
   * Runs `work` inside the transaction that flips the session to completed —
   * the only window in which a snapshot may be written. Rolls back when the
   * work raises, so a rejected case leaves the session in progress.
   */
  async function finalizing<T>(
    sessionId: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(FINALIZE_SQL, [sessionId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * A tenant transaction that also presents the erasure marker, the way the
   * audited erasure command will.
   */
  function erasing(participantId: string, sql: string, values: unknown[]) {
    return tenantA.transaction(async (client) => {
      await client.query(
        `SET LOCAL ${ERASURE_GUC} = ${pg.escapeLiteral(participantId)}`,
      );
      return client.query(sql, values);
    });
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const protocolId = randomUUID();
      const versionId = randomUUID();
      protocolOf[teamId] = protocolId;
      versionOf[teamId] = versionId;
      await insert('protocols', {
        id: protocolId,
        team_id: teamId,
        name: `${teamId} protocol`,
      });
      await insert('protocol_versions', {
        id: versionId,
        protocol_id: protocolId,
        team_id: teamId,
        version_number: 1,
        version_hash: `hash-${teamId}`,
        manifest: JSON.stringify({ name: teamId }),
        schema_version: 8,
        source_manifest_hash: `source-${teamId}`,
      });
    }
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  describe('nodes', () => {
    it('applies the documented defaults', async () => {
      const { sessionId } = await newFixture();
      const nodeId = await newNode(sessionId);

      const row = await pool.query<Row>(
        `SELECT attributes, secure_attributes, stage_id, prompt_ids
         FROM nodes WHERE session_id = $1 AND node_id = $2`,
        [sessionId, nodeId],
      );
      expect(row.rows[0]).toEqual({
        attributes: {},
        secure_attributes: null,
        stage_id: null,
        prompt_ids: null,
      });
    });

    it.each([
      ['a blank node id', { node_id: '' }, 'nodes_identifier_lengths_check'],
      [
        'a node id past 128 characters',
        { node_id: 'n'.repeat(129) },
        'nodes_identifier_lengths_check',
      ],
      ['a blank type', { type: '' }, 'nodes_identifier_lengths_check'],
      [
        'a type past 128 characters',
        { type: 't'.repeat(129) },
        'nodes_identifier_lengths_check',
      ],
      [
        'a stage id past 128 characters',
        { stage_id: 's'.repeat(129) },
        'nodes_identifier_lengths_check',
      ],
      [
        'scalar attributes',
        { attributes: JSON.stringify(3) },
        'nodes_attributes_object_check',
      ],
      [
        'array attributes',
        { attributes: JSON.stringify([1, 2]) },
        'nodes_attributes_object_check',
      ],
      [
        'scalar secure attributes',
        { secure_attributes: JSON.stringify('x') },
        'nodes_attributes_object_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const { sessionId } = await newFixture();
      await expect(
        insert('nodes', nodeRow(sessionId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts a roster-format node id', async () => {
      // `${subjectType}_${objectHash}` is what loadExternalData mints for a
      // roster-sourced node. This is the probe that fails against the uuid
      // column the datastore spike used.
      const { sessionId } = await newFixture();
      const rosterId = `person_3f2a9c${randomUUID().replaceAll('-', '')}`;
      await expect(
        insert('nodes', nodeRow(sessionId, { node_id: rosterId })),
      ).resolves.toMatchObject({ rowCount: 1 });

      const stored = await pool.query<{ node_id: string }>(
        `SELECT node_id FROM nodes WHERE session_id = $1`,
        [sessionId],
      );
      expect(stored.rows).toEqual([{ node_id: rosterId }]);
    });

    it('round-trips secure attributes and prompt ids unchanged', async () => {
      const { sessionId } = await newFixture();
      // NcEntity['_secureAttributes']: per-variable {iv, salt} byte arrays.
      const secureAttributes = {
        'b8b2b0e0-0000-4000-8000-000000000001': {
          iv: [12, 0, 255, 7, 128],
          salt: [1, 2, 3, 4, 5, 6, 7, 8],
        },
      };
      // Order and duplicates are meaningful: promptIDs records which prompts
      // created the node, in the order they did.
      const promptIds = ['prompt-2', 'prompt-1', 'prompt-2'];
      const nodeId = await newNode(sessionId, {
        secure_attributes: JSON.stringify(secureAttributes),
        prompt_ids: promptIds,
        stage_id: 'stage-3',
      });

      const stored = await pool.query<{
        secure_attributes: unknown;
        prompt_ids: string[];
        stage_id: string;
      }>(
        `SELECT secure_attributes, prompt_ids, stage_id
         FROM nodes WHERE session_id = $1 AND node_id = $2`,
        [sessionId, nodeId],
      );
      expect(stored.rows[0]?.secure_attributes).toEqual(secureAttributes);
      expect(stored.rows[0]?.prompt_ids).toEqual(promptIds);
      expect(stored.rows[0]?.stage_id).toBe('stage-3');
    });

    it('refuses a node whose team disagrees with its session', async () => {
      const { sessionId } = await newFixture();
      await expect(
        insert('nodes', nodeRow(sessionId, { team_id: TEAM_B })),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "interview_sessions"',
        ),
      });
    });

    it('refuses a second node with the same id in one session', async () => {
      const { sessionId } = await newFixture();
      const nodeId = await newNode(sessionId);
      await expect(
        insert('nodes', nodeRow(sessionId, { node_id: nodeId })),
      ).rejects.toMatchObject({ constraint: 'nodes_pkey' });

      // The same id in another session is a different node, and allowed.
      const other = await newFixture();
      await expect(
        insert('nodes', nodeRow(other.sessionId, { node_id: nodeId })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('edges', () => {
    it('applies the documented defaults', async () => {
      const { sessionId } = await newFixture();
      const from = await newNode(sessionId);
      const to = await newNode(sessionId);
      const row = edgeRow(sessionId, from, to);
      await insert('edges', row);

      const stored = await pool.query<Row>(
        `SELECT attributes, secure_attributes FROM edges WHERE edge_id = $1`,
        [row.edge_id],
      );
      expect(stored.rows[0]).toEqual({
        attributes: {},
        secure_attributes: null,
      });
    });

    it.each([
      ['a blank edge id', { edge_id: '' }, 'edges_identifier_lengths_check'],
      [
        'an edge id past 128 characters',
        { edge_id: 'e'.repeat(129) },
        'edges_identifier_lengths_check',
      ],
      ['a blank type', { type: '' }, 'edges_identifier_lengths_check'],
      [
        'a type past 128 characters',
        { type: 't'.repeat(129) },
        'edges_identifier_lengths_check',
      ],
      [
        'scalar attributes',
        { attributes: JSON.stringify(false) },
        'edges_attributes_object_check',
      ],
      [
        'scalar secure attributes',
        { secure_attributes: JSON.stringify(1) },
        'edges_attributes_object_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const { sessionId } = await newFixture();
      const from = await newNode(sessionId);
      const to = await newNode(sessionId);
      await expect(
        insert('edges', edgeRow(sessionId, from, to, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('rejects an endpoint id past 128 characters', async () => {
      // The length check fires before the endpoint key can, so this case
      // proves the check rather than the foreign key.
      const { sessionId } = await newFixture();
      const to = await newNode(sessionId);
      await expect(
        insert('edges', edgeRow(sessionId, 'f'.repeat(129), to)),
      ).rejects.toMatchObject({
        constraint: 'edges_identifier_lengths_check',
      });
      await expect(
        insert('edges', edgeRow(sessionId, to, 't'.repeat(129))),
      ).rejects.toMatchObject({
        constraint: 'edges_identifier_lengths_check',
      });
    });

    it.each([
      ['from_node', true],
      ['to_node', false],
    ])('refuses an edge whose %s is not a node', async (_label, absentFrom) => {
      const { sessionId } = await newFixture();
      const present = await newNode(sessionId);
      const absent = `node_${randomUUID().slice(0, 8)}`;
      await expect(
        insert(
          'edges',
          absentFrom
            ? edgeRow(sessionId, absent, present)
            : edgeRow(sessionId, present, absent),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining('is not present in table "nodes"'),
      });
    });

    it('refuses an endpoint that belongs to another session', async () => {
      const mine = await newFixture();
      const theirs = await newFixture();
      const local = await newNode(mine.sessionId);
      const foreign = await newNode(theirs.sessionId);

      await expect(
        insert('edges', edgeRow(mine.sessionId, local, foreign)),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining('is not present in table "nodes"'),
      });
      await expect(
        insert('edges', edgeRow(mine.sessionId, local, local)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses an edge whose team disagrees with its session', async () => {
      const { sessionId } = await newFixture();
      const from = await newNode(sessionId);
      const to = await newNode(sessionId);
      await expect(
        insert('edges', edgeRow(sessionId, from, to, { team_id: TEAM_B })),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "interview_sessions"',
        ),
      });
    });
  });

  describe('session_snapshots', () => {
    it('refuses a snapshot written outside the finalizing transaction', async () => {
      const fixture = await newFixture();

      // In progress: there is nothing to snapshot yet.
      await expect(
        insert('session_snapshots', snapshotRow(fixture)),
      ).rejects.toThrow(
        'a session snapshot may only be written in the transaction that finalizes its session',
      );

      // Completed, but in an earlier transaction: the window has closed.
      // Finalizing now has to write the snapshot, so the audited erasure is
      // what takes it away again — leaving a completed session whose window
      // shut with the commit before this one.
      await finalize(fixture.sessionId);
      await erasing(
        fixture.participantId,
        `DELETE FROM session_snapshots WHERE session_id = $1`,
        [fixture.sessionId],
      );
      await expect(
        insert('session_snapshots', snapshotRow(fixture)),
      ).rejects.toThrow(
        'a session snapshot may only be written in the transaction that finalizes its session',
      );
    });

    it('refuses at commit a session finalized with no snapshot', async () => {
      const fixture = await newFixture();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Deferred: the flip itself is accepted, and only the commit weighs
        // it. Asserting the update resolves is what proves the deferral —
        // an immediate check would have raised here instead.
        await expect(
          client.query(FINALIZE_SQL, [fixture.sessionId]),
        ).resolves.toMatchObject({ rowCount: 1 });
        await expect(client.query('COMMIT')).rejects.toThrow(
          'a completed interview session must carry its as-collected snapshot',
        );
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }

      // The refused commit took the flip with it, so the session is still
      // collectable rather than frozen with nothing to export.
      const after = await pool.query<{ status: string }>(
        `SELECT status FROM interview_sessions WHERE id = $1`,
        [fixture.sessionId],
      );
      expect(after.rows[0]?.status).toBe('in_progress');

      // And the same flip, carrying its snapshot, commits.
      await expect(finalize(fixture.sessionId)).resolves.toMatchObject({
        rowCount: 1,
      });
    });

    it('requires the snapshot of a session inserted already completed', async () => {
      // The seed's shape: sessions are inserted `completed` and their
      // snapshots written later in the same transaction, which is exactly what
      // deferring the check to commit admits.
      const { studyId, waveId } = await newFixture();
      // Anonymous sessions, because the fixture's participant already holds
      // the wave's one live session.
      const session = (id: string) => [
        id,
        studyId,
        TEAM_A,
        waveId,
        versionOf[TEAM_A],
        `ego_${id.slice(0, 8)}`,
      ];
      const insertCompleted = `INSERT INTO interview_sessions
           (id, study_id, team_id, wave_id,
            protocol_version_id, ego_uid, status, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'completed', now())`;

      const orphan = randomUUID();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(insertCompleted, session(orphan));
        await expect(client.query('COMMIT')).rejects.toThrow(
          'a completed interview session must carry its as-collected snapshot',
        );
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }

      const withSnapshot = randomUUID();
      const second = await pool.connect();
      try {
        await second.query('BEGIN');
        await second.query(insertCompleted, session(withSnapshot));
        await second.query(SNAPSHOT_SQL, [withSnapshot]);
        await second.query('COMMIT');
      } finally {
        second.release();
      }
      const stored = await pool.query<{ id: string }>(
        `SELECT id FROM interview_sessions WHERE id = ANY($1)`,
        [[orphan, withSnapshot]],
      );
      expect(stored.rows).toEqual([{ id: withSnapshot }]);
    });

    it('accepts a snapshot inside the finalizing transaction', async () => {
      const fixture = await newFixture();
      const payload = { nodes: [{ _uid: 'person_1' }], ego: { age: 41 } };

      await expect(
        finalizing(fixture.sessionId, (client) =>
          client.query(
            `INSERT INTO session_snapshots
               (session_id, team_id, study_id, protocol_version_id,
                schema_version, payload, payload_hash)
             VALUES ($1, $2, $3, $4, 8, $5, 'sha256:cafe')`,
            [
              fixture.sessionId,
              TEAM_A,
              fixture.studyId,
              versionOf[TEAM_A],
              JSON.stringify(payload),
            ],
          ),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      const stored = await pool.query<{ payload: unknown; created_at: Date }>(
        `SELECT payload, created_at FROM session_snapshots WHERE session_id = $1`,
        [fixture.sessionId],
      );
      expect(stored.rows[0]?.payload).toEqual(payload);
      expect(stored.rows[0]?.created_at).toBeInstanceOf(Date);
    });

    it.each([
      ['a scalar payload', { payload: JSON.stringify(3) }],
      ['an array payload', { payload: JSON.stringify([]) }],
      ['a schema version of zero', { schema_version: 0 }],
      ['a negative schema version', { schema_version: -1 }],
      ['a blank payload hash', { payload_hash: '' }],
      ['a payload hash past 128 characters', { payload_hash: 'h'.repeat(129) }],
    ])('rejects %s', async (_label, overrides) => {
      const fixture = await newFixture();
      const row = snapshotRow(fixture, overrides);
      const columns = Object.keys(row);
      await expect(
        finalizing(fixture.sessionId, (client) =>
          client.query(
            `INSERT INTO session_snapshots (${columns.map((n) => `"${n}"`).join(', ')})
             VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
            Object.values(row),
          ),
        ),
      ).rejects.toMatchObject({
        constraint: 'session_snapshots_payload_check',
      });
    });

    it('refuses a version pin from another team', async () => {
      const fixture = await newFixture();
      await expect(
        finalizing(fixture.sessionId, (client) =>
          client.query(
            `INSERT INTO session_snapshots
               (session_id, team_id, study_id, protocol_version_id,
                schema_version, payload, payload_hash)
             VALUES ($1, $2, $3, $4, 8, '{}'::jsonb, 'sha256:cafe')`,
            [fixture.sessionId, TEAM_A, fixture.studyId, versionOf[TEAM_B]],
          ),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "protocol_versions"',
        ),
      });
    });

    it('refuses a version pin or schema version that is not the session’s', async () => {
      const fixture = await newFixture();
      // A second version of the same team's line: the team-scoped key admits
      // it, and only the session knows it is the wrong one.
      const otherVersionId = randomUUID();
      await insert('protocol_versions', {
        id: otherVersionId,
        protocol_id: protocolOf[TEAM_A],
        team_id: TEAM_A,
        version_number: 2,
        version_hash: `hash-${otherVersionId}`,
        manifest: JSON.stringify({ name: 'v2' }),
        schema_version: 9,
        source_manifest_hash: `source-${otherVersionId}`,
      });
      const snapshot = (overrides: Row) => {
        const row = snapshotRow(fixture, overrides);
        const columns = Object.keys(row);
        return finalizing(fixture.sessionId, (client) =>
          client.query(
            `INSERT INTO session_snapshots (${columns.map((n) => `"${n}"`).join(', ')})
             VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
            Object.values(row),
          ),
        );
      };

      await expect(
        snapshot({ protocol_version_id: otherVersionId, schema_version: 9 }),
      ).rejects.toThrow(
        "a session snapshot must carry its session's own protocol version pin",
      );
      await expect(snapshot({ schema_version: 9 })).rejects.toThrow(
        "a session snapshot's schema version must be its protocol version's (8)",
      );
      await expect(snapshot({})).resolves.toMatchObject({ rowCount: 1 });
    });

    it('always raises on UPDATE, and deletes only under the marker', async () => {
      const fixture = await newFixture();
      await finalizing(fixture.sessionId, (client) =>
        client.query(
          `INSERT INTO session_snapshots
             (session_id, team_id, study_id, protocol_version_id,
              schema_version, payload, payload_hash)
           VALUES ($1, $2, $3, $4, 8, '{}'::jsonb, 'sha256:cafe')`,
          [fixture.sessionId, TEAM_A, fixture.studyId, versionOf[TEAM_A]],
        ),
      );

      await expect(
        pool.query(
          `UPDATE session_snapshots SET payload_hash = 'x' WHERE session_id = $1`,
          [fixture.sessionId],
        ),
      ).rejects.toThrow('session snapshots are immutable');
      // Even a no-op update: immutability is not about what changed.
      await expect(
        pool.query(
          `UPDATE session_snapshots SET schema_version = schema_version WHERE session_id = $1`,
          [fixture.sessionId],
        ),
      ).rejects.toThrow('session snapshots are immutable');

      await expect(
        tenantA.query(`DELETE FROM session_snapshots WHERE session_id = $1`, [
          fixture.sessionId,
        ]),
      ).rejects.toThrow(
        'session snapshots are deleted only by an audited erasure or the maintenance purge',
      );
      await expect(
        erasing(
          fixture.participantId,
          `DELETE FROM session_snapshots WHERE session_id = $1`,
          [fixture.sessionId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('the rollup tables', () => {
    it.each([
      [
        'a negative node count',
        { node_count: -1 },
        'session_stats_counts_check',
      ],
      [
        'a negative edge count',
        { edge_count: -1 },
        'session_stats_counts_check',
      ],
      [
        'a wave number of zero',
        { wave_number: 0 },
        'session_stats_counts_check',
      ],
    ])(
      'rejects session_stats with %s',
      async (_label, overrides, constraint) => {
        const fixture = await newFixture();
        await expect(
          insert('session_stats', statsRow(fixture, overrides)),
        ).rejects.toMatchObject({ constraint });
      },
    );

    it.each([
      ['a negative degree', { degree: -1 }, 'session_degree_hist_counts_check'],
      [
        'an empty bucket',
        { node_count: 0 },
        'session_degree_hist_counts_check',
      ],
    ])(
      'rejects session_degree_hist with %s',
      async (_label, overrides, constraint) => {
        const fixture = await newFixture();
        await expect(
          insert('session_degree_hist', histRow(fixture, overrides)),
        ).rejects.toMatchObject({ constraint });
      },
    );

    it('applies the documented session_stats default', async () => {
      const fixture = await newFixture();
      await insert('session_stats', statsRow(fixture));
      const stored = await pool.query<{ computed_at: Date }>(
        `SELECT computed_at FROM session_stats WHERE session_id = $1`,
        [fixture.sessionId],
      );
      expect(stored.rows[0]?.computed_at).toBeInstanceOf(Date);
    });

    it('refuses a wave that belongs to another study', async () => {
      const mine = await newFixture();
      const theirs = await newFixture();
      await expect(
        insert('session_stats', statsRow(mine, { wave_id: theirs.waveId })),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "study_waves"',
        ),
      });
    });

    it('refuses a participant that belongs to another study', async () => {
      const mine = await newFixture();
      const theirs = await newFixture();
      await expect(
        insert(
          'session_stats',
          statsRow(mine, { participant_id: theirs.participantId }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "participants"',
        ),
      });
    });
  });

  describe('the statement-level parent guard', () => {
    it('refuses a rollup that copies another wave, wave number or participant', async () => {
      const fixture = await newFixture();
      // A second wave and a second participant of the SAME study: the
      // same-study keys admit both, and only the session says they are not
      // this session's.
      const otherWaveId = randomUUID();
      await insert('study_waves', {
        id: otherWaveId,
        study_id: fixture.studyId,
        team_id: TEAM_A,
        wave_number: 2,
      });
      const otherParticipantId = randomUUID();
      await insert('participants', {
        id: otherParticipantId,
        study_id: fixture.studyId,
        team_id: TEAM_A,
        participant_code: 'P-other',
      });
      const refused =
        "a session rollup must copy its own session's study, wave and participant";

      await expect(
        insert('session_stats', statsRow(fixture, { wave_id: otherWaveId })),
      ).rejects.toThrow(refused);
      await expect(
        insert('session_stats', statsRow(fixture, { wave_number: 2 })),
      ).rejects.toThrow(refused);
      await expect(
        insert(
          'session_stats',
          statsRow(fixture, { participant_id: otherParticipantId }),
        ),
      ).rejects.toThrow(refused);
      await expect(
        insert('session_stats', statsRow(fixture, { participant_id: null })),
      ).rejects.toThrow(refused);
      await expect(
        insert('session_stats', statsRow(fixture)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses node and edge writes under a closed study', async () => {
      const { studyId, sessionId } = await newFixture();
      const from = await newNode(sessionId);
      const to = await newNode(sessionId);
      await closeStudy(studyId);

      await expect(insert('nodes', nodeRow(sessionId))).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );
      await expect(
        insert('edges', edgeRow(sessionId, from, to)),
      ).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );
      await expect(
        pool.query(`UPDATE nodes SET type = 'place' WHERE session_id = $1`, [
          sessionId,
        ]),
      ).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );
    });

    it('refuses node and edge writes under a finalized session', async () => {
      const { sessionId } = await newFixture();
      const from = await newNode(sessionId);
      const to = await newNode(sessionId);
      await insert('edges', edgeRow(sessionId, from, to));
      await finalize(sessionId);

      await expect(insert('nodes', nodeRow(sessionId))).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );
      await expect(
        insert('edges', edgeRow(sessionId, from, to)),
      ).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );

      // The session is named, so a multi-session statement says which row
      // stopped it.
      await expect(insert('nodes', nodeRow(sessionId))).rejects.toThrow(
        sessionId,
      );
    });

    it('lets the finalizing transaction write its own rollups and snapshot', async () => {
      const fixture = await newFixture();
      const from = await newNode(fixture.sessionId);
      const to = await newNode(fixture.sessionId);
      await insert('edges', edgeRow(fixture.sessionId, from, to));

      await expect(
        tenantA.transaction(async (client) => {
          await client.query(FINALIZE_SQL, [fixture.sessionId]);
          // Both of these touch guarded tables under a session whose status is
          // already 'completed'; only the same-transaction xmin test lets them
          // through.
          await refreshSessionProjections(client, {
            teamId: TEAM_A,
            sessionId: fixture.sessionId,
          });
          await client.query(
            `INSERT INTO session_snapshots
               (session_id, team_id, study_id, protocol_version_id,
                schema_version, payload, payload_hash)
             VALUES ($1, $2, $3, $4, 8, '{}'::jsonb, 'sha256:cafe')`,
            [fixture.sessionId, TEAM_A, fixture.studyId, versionOf[TEAM_A]],
          );
          return 'finalized';
        }),
      ).resolves.toBe('finalized');

      const stats = await pool.query<{ node_count: number }>(
        `SELECT node_count FROM session_stats WHERE session_id = $1`,
        [fixture.sessionId],
      );
      expect(stats.rows[0]?.node_count).toBe(2);

      // And the window is exactly one transaction wide: the next refresh is
      // refused, which is what makes the escape narrow rather than a hole.
      await expect(
        tenantA.transaction((client) =>
          refreshSessionProjections(client, {
            teamId: TEAM_A,
            sessionId: fixture.sessionId,
          }),
        ),
      ).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );
    });

    it('holds a network row on its session and team', async () => {
      const mine = await newFixture();
      const theirs = await newFixture();
      const nodeId = await newNode(mine.sessionId);

      await expect(
        pool.query(`UPDATE nodes SET session_id = $2 WHERE node_id = $1`, [
          nodeId,
          theirs.sessionId,
        ]),
      ).rejects.toThrow('a network row cannot change session or team');
      await expect(
        pool.query(`UPDATE nodes SET team_id = $2 WHERE node_id = $1`, [
          nodeId,
          TEAM_B,
        ]),
      ).rejects.toThrow('a network row cannot change session or team');

      // Everything else about an in-progress session's node stays editable.
      await expect(
        pool.query(`UPDATE nodes SET type = 'place' WHERE node_id = $1`, [
          nodeId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('deleting network rows', () => {
    it('treats an unmarked delete on a live session as an ordinary edit', async () => {
      const fixture = await newFixture();
      const from = await newNode(fixture.sessionId);
      const to = await newNode(fixture.sessionId);
      await insert('edges', edgeRow(fixture.sessionId, from, to));

      // The runtime removes a node and its edges whenever a participant
      // changes their mind. Bottom-up, the order every delete path follows:
      // edges before the nodes they prove — the endpoint key is an AFTER ROW
      // constraint trigger, which fires before this statement-level guard.
      await expect(
        tenantA.query(`DELETE FROM edges WHERE session_id = $1`, [
          fixture.sessionId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        tenantA.query(`DELETE FROM nodes WHERE session_id = $1`, [
          fixture.sessionId,
        ]),
      ).resolves.toMatchObject({ rowCount: 2 });
    });

    it('refuses an unmarked delete under a finalized session and admits the marked one', async () => {
      const fixture = await newFixture();
      await newNode(fixture.sessionId);
      await finalize(fixture.sessionId);

      await expect(
        tenantA.query(`DELETE FROM nodes WHERE session_id = $1`, [
          fixture.sessionId,
        ]),
      ).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );
      await expect(
        erasing(
          fixture.participantId,
          `DELETE FROM nodes WHERE session_id = $1`,
          [fixture.sessionId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('proves the marker against the session it deletes', async () => {
      const target = await newFixture();
      const bystander = await newFixture();
      await newNode(target.sessionId);
      await newNode(bystander.sessionId);

      const bothSessions = [target.sessionId, bystander.sessionId];

      await expect(
        erasing(
          bystander.participantId,
          `DELETE FROM nodes WHERE session_id = $1`,
          [target.sessionId],
        ),
      ).rejects.toThrow(
        "participant erasure may only delete the marked participant's network data",
      );
      // A statement that reaches past the marked participant is refused whole,
      // even though one of the rows it names would have been allowed.
      await expect(
        erasing(
          target.participantId,
          `DELETE FROM nodes WHERE session_id = ANY($1)`,
          [bothSessions],
        ),
      ).rejects.toThrow(
        "participant erasure may only delete the marked participant's network data",
      );
      await expect(
        erasing(
          target.participantId,
          `DELETE FROM nodes WHERE session_id = $1`,
          [target.sessionId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      const survivors = await pool.query<{ session_id: string }>(
        `SELECT session_id FROM nodes WHERE session_id = ANY($1)`,
        [bothSessions],
      );
      expect(survivors.rows).toEqual([{ session_id: bystander.sessionId }]);
    });

    it('admits the maintenance purge without a marker', async () => {
      const fixture = await newFixture();
      await newNode(fixture.sessionId);
      await expect(
        maintenance.query(`DELETE FROM nodes WHERE session_id = $1`, [
          fixture.sessionId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('lets the projection refresh rewrite its own histogram', async () => {
      // The refresh deletes and reinserts session_degree_hist on every call;
      // on a live session that is an ordinary edit under the parent-writable
      // rule, like every other unmarked application-role delete.
      const fixture = await newFixture();
      await newNode(fixture.sessionId);
      const refresh = () =>
        tenantA.transaction((client) =>
          refreshSessionProjections(client, {
            teamId: TEAM_A,
            sessionId: fixture.sessionId,
          }),
        );
      await refresh();

      await expect(
        tenantA.query(`DELETE FROM session_degree_hist WHERE session_id = $1`, [
          fixture.sessionId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });

      // And the relaxation stops at the parent: a finalized session's
      // histogram is still off limits without the marker. The refresh puts the
      // row back first, so the delete below has something to delete — an
      // empty transition table names no offender and would pass.
      await refresh();
      await finalize(fixture.sessionId);
      await expect(
        tenantA.query(`DELETE FROM session_degree_hist WHERE session_id = $1`, [
          fixture.sessionId,
        ]),
      ).rejects.toThrow(
        'network data for a finalized session or a closed study is read-only',
      );
    });
  });

  describe('row-level security', () => {
    it('rejects a mismatched team before the statement guard can run', async () => {
      // The probe behind the guard function deliberately not being
      // SECURITY DEFINER: the fail-open a definer would close — a `changed`
      // row whose parent session is invisible under the transaction's policy —
      // is already closed by the row's own WITH CHECK policy, which rejects
      // the write before the AFTER trigger ever sees it.
      const { sessionId } = await newFixture(TEAM_B);

      const rejection = await tenantA
        .query(
          `INSERT INTO nodes (team_id, session_id, node_id, type)
           VALUES ($1, $2, 'n1', 'person')`,
          [TEAM_B, sessionId],
        )
        .then(
          () => null,
          (err: unknown) => err as pg.DatabaseError,
        );

      expect(rejection?.code).toBe('42501');
      expect(rejection?.message).toContain('row-level security policy');
      expect(rejection?.message).not.toContain('read-only');

      const written = await pool.query(
        `SELECT node_id FROM nodes WHERE session_id = $1`,
        [sessionId],
      );
      expect(written.rows).toEqual([]);
    });
  });
});
