// The study spine's database-enforced promises: every CHECK, the composite
// foreign keys that prove same-study membership, and the sidecar triggers that
// make a closed study read-only, a live study's participation mode and go-live
// record final, a wave's identity fixed, every version pin a version of the
// study's own protocol line, a finalized session immutable, and a participant
// delete possible only under the audited erasure marker or the maintenance
// purge.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { ERASURE_GUC, MAX_WAVES_PER_STUDY } from '../schema.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

describe.skipIf(!db)('study spine schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  /** One published protocol version per team, for the wave and session pins. */
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

  // Every fixture study names its team's protocol line and every fixture wave
  // pins that line's published version: `study_waves_version_own_line` refuses
  // a pin whose study has no line, and `interview_sessions_version_wave_pin`
  // refuses a session under a wave that pins nothing.
  const studyRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    name: 'A study',
    protocol_id: protocolOf[TEAM_A],
    ...overrides,
  });

  const waveRow = (studyId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    study_id: studyId,
    team_id: TEAM_A,
    wave_number: 1,
    protocol_version_id: versionOf[TEAM_A],
    ...overrides,
  });

  const participantRow = (studyId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    study_id: studyId,
    team_id: TEAM_A,
    participant_code: `P-${randomUUID().slice(0, 8)}`,
    ...overrides,
  });

  const sessionRow = (
    studyId: string,
    waveId: string,
    overrides: Row = {},
  ): Row => ({
    id: randomUUID(),
    study_id: studyId,
    team_id: TEAM_A,
    wave_id: waveId,
    protocol_version_id: versionOf[TEAM_A],
    ego_uid: `ego_${randomUUID().slice(0, 8)}`,
    ...overrides,
  });

  const linkRow = (
    studyId: string,
    waveId: string,
    overrides: Row = {},
  ): Row => ({
    id: randomUUID(),
    study_id: studyId,
    team_id: TEAM_A,
    wave_id: waveId,
    kind: 'anonymous',
    token_hash: randomBytes(32),
    ...overrides,
  });

  async function newStudy(overrides: Row = {}): Promise<string> {
    const row = studyRow(overrides);
    await insert('studies', row);
    return row.id as string;
  }

  async function newWave(
    studyId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = waveRow(studyId, overrides);
    await insert('study_waves', row);
    return row.id as string;
  }

  async function newParticipant(
    studyId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = participantRow(studyId, overrides);
    await insert('participants', row);
    return row.id as string;
  }

  async function newSession(
    studyId: string,
    waveId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = sessionRow(studyId, waveId, overrides);
    await insert('interview_sessions', row);
    return row.id as string;
  }

  /** Another published version of `protocolId`, inside TEAM_A. */
  async function newVersion(
    protocolId: string,
    versionNumber: number,
  ): Promise<string> {
    const versionId = randomUUID();
    await insert('protocol_versions', {
      id: versionId,
      protocol_id: protocolId,
      team_id: TEAM_A,
      version_number: versionNumber,
      version_hash: `hash-${versionId}`,
      manifest: JSON.stringify({ name: 'another version' }),
      schema_version: 8,
      source_manifest_hash: `source-${versionId}`,
    });
    return versionId;
  }

  /**
   * A second protocol line in TEAM_A, with one published version. The
   * team-scoped composite keys admit its version anywhere the team's own does,
   * so it is the fixture every "same team, wrong line" case needs.
   */
  async function newProtocolLine(): Promise<{
    protocolId: string;
    versionId: string;
  }> {
    const protocolId = randomUUID();
    await insert('protocols', {
      id: protocolId,
      team_id: TEAM_A,
      name: `Another protocol ${protocolId.slice(0, 8)}`,
    });
    return { protocolId, versionId: await newVersion(protocolId, 1) };
  }

  /** A study with one wave and one participant, all open. */
  async function newTrio(): Promise<{
    studyId: string;
    waveId: string;
    participantId: string;
  }> {
    const studyId = await newStudy();
    return {
      studyId,
      waveId: await newWave(studyId),
      participantId: await newParticipant(studyId),
    };
  }

  async function closeStudy(studyId: string): Promise<void> {
    await pool.query(
      `UPDATE studies SET state = 'closed', closed_at = now(),
           went_live_at = COALESCE(went_live_at, now()) WHERE id = $1`,
      [studyId],
    );
  }

  /**
   * Finalizes a session the only way the database now admits: the flip to
   * `completed` and the session's snapshot in one transaction. The deferred
   * `interview_sessions_completion_snapshot` weighs the pair at commit, and
   * `session_snapshots_insert_at_finalization` refuses the snapshot in any
   * other transaction — so a study-module fixture that needs a finalized
   * session has to write the network module's row too.
   */
  async function finalize(sessionId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE interview_sessions
         SET status = 'completed', completed_at = now() WHERE id = $1`,
        [sessionId],
      );
      await client.query(
        `INSERT INTO session_snapshots
           (session_id, team_id, study_id, protocol_version_id,
            schema_version, payload, payload_hash)
         SELECT s.id, s.team_id, s.study_id, s.protocol_version_id,
                v.schema_version, '{}'::jsonb, 'sha256:finalized'
         FROM interview_sessions s
         JOIN protocol_versions v
           ON v.id = s.protocol_version_id AND v.team_id = s.team_id
         WHERE s.id = $1`,
        [sessionId],
      );
      await client.query('COMMIT');
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

  describe('studies', () => {
    it('applies the documented defaults', async () => {
      const studyId = await newStudy();

      const row = await pool.query<Row>(
        `SELECT state, participation_mode, wave_progression, pause_grace_minutes,
                settings, deletion_requested_at, purge_after, went_live_at,
                paused_at, closed_at
         FROM studies WHERE id = $1`,
        [studyId],
      );
      expect(row.rows[0]).toEqual({
        state: 'draft',
        participation_mode: 'managed',
        wave_progression: 'window',
        pause_grace_minutes: 60,
        settings: {},
        deletion_requested_at: null,
        purge_after: null,
        went_live_at: null,
        paused_at: null,
        closed_at: null,
      });
    });

    it.each([
      ['a blank name', { name: '   ' }, 'studies_name_nonblank_check'],
      [
        'a name past 320 characters',
        { name: 'x'.repeat(321) },
        'studies_name_nonblank_check',
      ],
      ['an unknown state', { state: 'archived' }, 'studies_state_check'],
      [
        'an unknown participation mode',
        { participation_mode: 'hybrid' },
        'studies_participation_mode_check',
      ],
      [
        'an unknown wave progression',
        { wave_progression: 'parallel' },
        'studies_wave_progression_check',
      ],
      [
        'a negative pause grace',
        { pause_grace_minutes: -1 },
        'studies_pause_grace_minutes_check',
      ],
      [
        'a pause grace past thirty days',
        { pause_grace_minutes: 43_201 },
        'studies_pause_grace_minutes_check',
      ],
      [
        'scalar settings',
        { settings: JSON.stringify(3) },
        'studies_settings_object_check',
      ],
      [
        'a deletion request with no deadline',
        { deletion_requested_at: new Date() },
        'studies_deletion_marker_check',
      ],
      [
        'a deadline with no deletion request',
        { purge_after: new Date() },
        'studies_deletion_marker_check',
      ],
      [
        'a closed state with no close timestamp',
        { state: 'closed', went_live_at: new Date() },
        'studies_closed_at_check',
      ],
      [
        'a close timestamp without the closed state',
        { closed_at: new Date() },
        'studies_closed_at_check',
      ],
      [
        'a paused state with no pause timestamp',
        { state: 'paused', went_live_at: new Date() },
        'studies_paused_at_check',
      ],
      [
        'a pause timestamp without the paused state',
        { paused_at: new Date() },
        'studies_paused_at_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert('studies', studyRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts the states the checks exist to admit', async () => {
      await expect(
        insert(
          'studies',
          studyRow({
            state: 'closed',
            went_live_at: new Date(),
            closed_at: new Date(),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert(
          'studies',
          studyRow({
            state: 'paused',
            went_live_at: new Date(),
            paused_at: new Date(),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      // Past draft without the go-live record that the mode freeze guards:
      // the evidence cannot be omitted by the transition that creates it.
      await expect(
        insert('studies', studyRow({ state: 'live' })),
      ).rejects.toMatchObject({ constraint: 'studies_went_live_at_check' });
      await expect(
        insert(
          'studies',
          studyRow({
            deletion_requested_at: new Date(),
            purge_after: new Date(),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a protocol pin from another team', async () => {
      await expect(
        insert(
          'studies',
          studyRow({ team_id: TEAM_A, protocol_id: protocolOf[TEAM_B] }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining('is not present in table "protocols"'),
      });
    });

    it('refuses a protocol retarget while a wave still pins a version', async () => {
      const studyId = await newStudy();
      const waveId = await newWave(studyId);
      const other = await newProtocolLine();

      await expect(
        pool.query(`UPDATE studies SET protocol_id = $2 WHERE id = $1`, [
          studyId,
          other.protocolId,
        ]),
      ).rejects.toThrow(
        "a study's protocol line cannot change while a wave still pins a version",
      );

      // The command layer clears every pin before it retargets a Draft; with
      // the pins gone the same write lands.
      await pool.query(
        `UPDATE study_waves SET protocol_version_id = NULL WHERE id = $1`,
        [waveId],
      );
      await expect(
        pool.query(`UPDATE studies SET protocol_id = $2 WHERE id = $1`, [
          studyId,
          other.protocolId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('freezes the participation mode and go-live record of a live study', async () => {
      const wentLiveAt = new Date('2026-04-01T09:00:00Z');
      const studyId = await newStudy({
        state: 'live',
        went_live_at: wentLiveAt,
      });

      await expect(
        pool.query(
          `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
          [studyId],
        ),
      ).rejects.toThrow(
        'a study that has gone live cannot change participation mode',
      );
      await expect(
        pool.query(`UPDATE studies SET went_live_at = NULL WHERE id = $1`, [
          studyId,
        ]),
      ).rejects.toThrow(
        "a study's first go-live is recorded once and never rewritten",
      );
      await expect(
        pool.query(`UPDATE studies SET went_live_at = now() WHERE id = $1`, [
          studyId,
        ]),
      ).rejects.toThrow(
        "a study's first go-live is recorded once and never rewritten",
      );

      // The rest of the lifecycle still moves, and leaves both alone.
      await expect(
        pool.query(
          `UPDATE studies SET state = 'paused', paused_at = now() WHERE id = $1`,
          [studyId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      const stored = await pool.query<Row>(
        `SELECT participation_mode, went_live_at FROM studies WHERE id = $1`,
        [studyId],
      );
      expect(stored.rows[0]).toEqual({
        participation_mode: 'managed',
        went_live_at: wentLiveAt,
      });
    });

    it('leaves a study that has never gone live free to choose its mode', async () => {
      // The freeze is evidence-driven: without `went_live_at` there is no
      // collected data for a mode change to reinterpret, and setting the
      // timestamp for the first time is how a study goes live at all.
      const studyId = await newStudy();

      await expect(
        pool.query(
          `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
          [studyId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE studies SET state = 'live', went_live_at = now() WHERE id = $1`,
          [studyId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('deleting a study', () => {
    it('is the maintenance purge’s alone', async () => {
      const studyId = await newStudy();
      await expect(
        pool.query(`DELETE FROM studies WHERE id = $1`, [studyId]),
      ).rejects.toThrow('studies are deleted only by the maintenance purge');
      await expect(
        tenantA.query(`DELETE FROM studies WHERE id = $1`, [studyId]),
      ).rejects.toThrow('studies are deleted only by the maintenance purge');
      await expect(
        maintenance.query(`DELETE FROM studies WHERE id = $1`, [studyId]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('closed studies are read-only', () => {
    it('permits only the allowed columns', async () => {
      const studyId = await newStudy();
      await closeStudy(studyId);

      await expect(
        pool.query(`UPDATE studies SET name = 'renamed' WHERE id = $1`, [
          studyId,
        ]),
      ).rejects.toThrow('closed studies are read-only');
      await expect(
        pool.query(
          `UPDATE studies SET pause_grace_minutes = 10 WHERE id = $1`,
          [studyId],
        ),
      ).rejects.toThrow('closed studies are read-only');

      // `updated_at` is on the allowed list, and the row stays closed.
      await expect(
        pool.query(`UPDATE studies SET updated_at = now() WHERE id = $1`, [
          studyId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE studies
           SET deletion_requested_at = now(), purge_after = now() + interval '30 days'
           WHERE id = $1`,
          [studyId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      ['closed -> draft', `state = 'draft', closed_at = NULL`],
      ['closed -> paused', `state = 'paused'`],
      ['closed -> live keeping the close timestamp', `state = 'live'`],
    ])('refuses the %s exit', async (_label, assignment) => {
      const studyId = await newStudy();
      await closeStudy(studyId);

      await expect(
        pool.query(`UPDATE studies SET ${assignment} WHERE id = $1`, [studyId]),
      ).rejects.toThrow('closed studies are read-only');
    });

    it('refuses a rewrite of the close timestamp while the study stays closed', async () => {
      // `closed_at` is on the allowlist only so the reopen below can clear it.
      const studyId = await newStudy();
      await closeStudy(studyId);
      const closedAt = await pool.query<{ closed_at: Date }>(
        `SELECT closed_at FROM studies WHERE id = $1`,
        [studyId],
      );

      await expect(
        pool.query(
          `UPDATE studies SET closed_at = now() - interval '30 days' WHERE id = $1`,
          [studyId],
        ),
      ).rejects.toThrow('closed studies are read-only');
      await expect(
        pool.query(`UPDATE studies SET closed_at = NULL WHERE id = $1`, [
          studyId,
        ]),
      ).rejects.toThrow('closed studies are read-only');

      const after = await pool.query<{ closed_at: Date }>(
        `SELECT closed_at FROM studies WHERE id = $1`,
        [studyId],
      );
      expect(after.rows[0]?.closed_at).toEqual(closedAt.rows[0]?.closed_at);
    });

    it('admits the single reopen shape', async () => {
      const studyId = await newStudy();
      await closeStudy(studyId);

      await expect(
        pool.query(
          `UPDATE studies SET state = 'live', closed_at = NULL WHERE id = $1`,
          [studyId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      const after = await pool.query<{ state: string }>(
        `SELECT state FROM studies WHERE id = $1`,
        [studyId],
      );
      expect(after.rows[0]?.state).toBe('live');
    });

    it('fails closed for a column added after the trigger', async () => {
      const closedId = await newStudy();
      await closeStudy(closedId);
      const openId = await newStudy();

      await pool.query(`ALTER TABLE studies ADD COLUMN probe text`);
      try {
        // The positive control: the same write on an open study succeeds, so
        // the rejection below is the trigger and not the new column itself.
        await expect(
          pool.query(`UPDATE studies SET probe = 'x' WHERE id = $1`, [openId]),
        ).resolves.toMatchObject({ rowCount: 1 });
        await expect(
          pool.query(`UPDATE studies SET probe = 'x' WHERE id = $1`, [
            closedId,
          ]),
        ).rejects.toThrow('closed studies are read-only');
      } finally {
        await pool.query(`ALTER TABLE studies DROP COLUMN probe`);
      }
    });
  });

  describe('study_waves', () => {
    it.each([
      ['wave number zero', { wave_number: 0 }, 'study_waves_wave_number_check'],
      ['a blank name', { name: ' \t ' }, 'study_waves_name_check'],
      [
        'a window that closes before it opens',
        {
          opens_at: new Date('2026-02-01T00:00:00Z'),
          closes_at: new Date('2026-01-01T00:00:00Z'),
        },
        'study_waves_window_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const studyId = await newStudy();
      await expect(
        insert('study_waves', waveRow(studyId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('refuses a second wave with the same number', async () => {
      const studyId = await newStudy();
      await newWave(studyId, { wave_number: 1 });
      await expect(
        insert('study_waves', waveRow(studyId, { wave_number: 1 })),
      ).rejects.toMatchObject({
        constraint: 'study_waves_study_id_wave_number_unique',
      });
      await expect(
        insert('study_waves', waveRow(studyId, { wave_number: 2 })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('leaves the wave cap to the command layer', async () => {
      // MAX_WAVES_PER_STUDY is a domain cap, not a database one. Nothing here
      // refuses the wave past it, so the command that counts is the only thing
      // between a study and its fifty-first wave; a CHECK added later must
      // update this case rather than silently subsume it.
      const studyId = await newStudy();
      await expect(
        insert(
          'study_waves',
          waveRow(studyId, { wave_number: MAX_WAVES_PER_STUDY + 1 }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a wave whose team disagrees with its study', async () => {
      const studyId = await newStudy({ team_id: TEAM_A });
      // The pin is dropped so the key to `studies` is the only one this row
      // can violate; with team B's wave carrying team A's version, the key to
      // `protocol_versions` would fail too and either could report.
      await expect(
        insert(
          'study_waves',
          waveRow(studyId, { team_id: TEAM_B, protocol_version_id: null }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining('is not present in table "studies"'),
      });
    });

    it('refuses a version pin from another team', async () => {
      const studyId = await newStudy();
      await expect(
        insert(
          'study_waves',
          waveRow(studyId, { protocol_version_id: versionOf[TEAM_B] }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "protocol_versions"',
        ),
      });
    });

    it('refuses a version pin from another protocol line in the same team', async () => {
      const studyId = await newStudy();
      const other = await newProtocolLine();
      const refused =
        "a wave's protocol version must belong to its study's protocol line";

      // The team-scoped key admits the version; only the study's own
      // `protocol_id` says it belongs to a different line.
      await expect(
        insert(
          'study_waves',
          waveRow(studyId, { protocol_version_id: other.versionId }),
        ),
      ).rejects.toThrow(refused);

      // Re-pinning a wave is proven the same way.
      const waveId = await newWave(studyId);
      await expect(
        pool.query(
          `UPDATE study_waves SET protocol_version_id = $2 WHERE id = $1`,
          [waveId, other.versionId],
        ),
      ).rejects.toThrow(refused);

      // A Draft with no line yet pins nothing at all, and a wave that pins
      // nothing is the state every Draft wave starts in.
      const draftId = await newStudy({ protocol_id: null });
      await expect(insert('study_waves', waveRow(draftId))).rejects.toThrow(
        refused,
      );
      await expect(
        insert('study_waves', waveRow(draftId, { protocol_version_id: null })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('holds wave identity immutable', async () => {
      const studyId = await newStudy();
      const otherStudyId = await newStudy();
      const waveId = await newWave(studyId);

      for (const assignment of [
        `wave_number = 2`,
        `id = '${randomUUID()}'`,
        `study_id = '${otherStudyId}'`,
      ]) {
        await expect(
          pool.query(`UPDATE study_waves SET ${assignment} WHERE id = $1`, [
            waveId,
          ]),
        ).rejects.toThrow('wave identity is immutable');
      }

      // Everything else about an open study's wave stays editable.
      await expect(
        pool.query(`UPDATE study_waves SET name = 'Baseline' WHERE id = $1`, [
          waveId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('scopes the closed-study exemption to a maintenance DELETE', async () => {
      const studyId = await newStudy();
      const waveId = await newWave(studyId);
      const secondWaveId = await newWave(studyId, { wave_number: 2 });
      await closeStudy(studyId);

      await expect(
        maintenance.query(
          `INSERT INTO study_waves (id, study_id, team_id, wave_number)
           VALUES ($1, $2, $3, 3)`,
          [randomUUID(), studyId, TEAM_A],
        ),
      ).rejects.toThrow('closed studies are read-only');
      await expect(
        maintenance.query(
          `UPDATE study_waves SET name = 'renamed' WHERE id = $1`,
          [waveId],
        ),
      ).rejects.toThrow('closed studies are read-only');
      await expect(
        tenantA.query(`DELETE FROM study_waves WHERE id = $1`, [waveId]),
      ).rejects.toThrow('closed studies are read-only');

      // The purge itself is the one write the guard lets through.
      await expect(
        maintenance.query(`DELETE FROM study_waves WHERE id = $1`, [waveId]),
      ).resolves.toMatchObject({ rowCount: 1 });

      // And an open study's wave is still the application role's to delete.
      const openStudyId = await newStudy();
      const openWaveId = await newWave(openStudyId);
      await expect(
        tenantA.query(`DELETE FROM study_waves WHERE id = $1`, [openWaveId]),
      ).resolves.toMatchObject({ rowCount: 1 });

      expect(secondWaveId).toBeTruthy();
    });
  });

  describe('participants_study_managed', () => {
    it('refuses a participant in an anonymous study', async () => {
      const studyId = await newStudy({ participation_mode: 'anonymous' });
      await expect(newParticipant(studyId)).rejects.toThrow(
        'anonymous studies hold no participants',
      );
    });

    it('refuses a draft becoming anonymous over the participants it holds', async () => {
      const studyId = await newStudy();
      await newParticipant(studyId);
      await expect(
        pool.query(
          `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
          [studyId],
        ),
      ).rejects.toThrow('a study holding participants cannot become anonymous');

      // Without a cohort the draft is still free to choose.
      const emptyId = await newStudy();
      await expect(
        pool.query(
          `UPDATE studies SET participation_mode = 'anonymous' WHERE id = $1`,
          [emptyId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('participants', () => {
    it('applies the documented defaults', async () => {
      const studyId = await newStudy();
      const participantId = await newParticipant(studyId);

      const row = await pool.query<Row>(
        `SELECT timezone, enrolled_at, pii_key_id, pii_algorithm,
                email_ciphertext, email_index
         FROM participants WHERE id = $1`,
        [participantId],
      );
      expect(row.rows[0]).toEqual({
        timezone: 'UTC',
        enrolled_at: null,
        pii_key_id: null,
        pii_algorithm: null,
        email_ciphertext: null,
        email_index: null,
      });
    });

    it.each([
      [
        'a blank participant code',
        { participant_code: '  ' },
        'participants_participant_code_check',
      ],
      [
        'a participant code past 128 characters',
        { participant_code: 'p'.repeat(129) },
        'participants_participant_code_check',
      ],
      [
        'a malformed time zone',
        { timezone: 'Not/A/Zone!' },
        'participants_timezone_check',
      ],
      [
        'a time zone past 64 characters',
        { timezone: `Europe/${'a'.repeat(64)}` },
        'participants_timezone_check',
      ],
      [
        'a source participant with no source study',
        { source_participant_id: randomUUID() },
        'participants_source_check',
      ],
      [
        'a source study with no source participant',
        { source_study_id: randomUUID() },
        'participants_source_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const studyId = await newStudy();
      await expect(
        insert('participants', participantRow(studyId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts a full IANA zone name', async () => {
      const studyId = await newStudy();
      await expect(
        insert(
          'participants',
          participantRow(studyId, {
            timezone: 'America/Argentina/Buenos_Aires',
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      [
        'an email ciphertext with no blind index',
        { email_ciphertext: randomBytes(48) },
      ],
      [
        'an email blind index with no ciphertext',
        { email_index: randomBytes(32) },
      ],
      [
        'a phone ciphertext with no blind index',
        { phone_ciphertext: randomBytes(48) },
      ],
      [
        'a phone blind index with no ciphertext',
        { phone_index: randomBytes(32) },
      ],
    ])('rejects %s', async (_label, overrides) => {
      const studyId = await newStudy();
      await expect(
        insert(
          'participants',
          participantRow(studyId, {
            ...overrides,
            pii_key_id: 'key-1',
            pii_algorithm: 'aes-256-gcm',
          }),
        ),
      ).rejects.toMatchObject({
        constraint: 'participants_blind_index_pairing_check',
      });
    });

    it.each([
      ['a key id with no algorithm', { pii_key_id: 'key-1' }],
      ['an algorithm with no key id', { pii_algorithm: 'aes-256-gcm' }],
      ['ciphertext with neither', { name_ciphertext: randomBytes(48) }],
    ])('rejects %s', async (_label, overrides) => {
      const studyId = await newStudy();
      await expect(
        insert('participants', participantRow(studyId, overrides)),
      ).rejects.toMatchObject({ constraint: 'participants_pii_key_check' });
    });

    it('accepts a fully paired encrypted tier and round-trips the bytes', async () => {
      const studyId = await newStudy();
      const emailCiphertext = randomBytes(48);
      const emailIndex = randomBytes(32);
      const row = participantRow(studyId, {
        email_ciphertext: emailCiphertext,
        email_index: emailIndex,
        pii_key_id: 'key-1',
        pii_algorithm: 'aes-256-gcm',
      });
      await insert('participants', row);

      const stored = await pool.query<{
        email_ciphertext: Buffer;
        email_index: Buffer;
      }>(
        `SELECT email_ciphertext, email_index FROM participants WHERE id = $1`,
        [row.id],
      );
      expect(stored.rows[0]?.email_ciphertext.equals(emailCiphertext)).toBe(
        true,
      );
      expect(stored.rows[0]?.email_index.equals(emailIndex)).toBe(true);
    });

    it('refuses a participant whose team disagrees with its study', async () => {
      const studyId = await newStudy({ team_id: TEAM_A });
      await expect(
        insert('participants', participantRow(studyId, { team_id: TEAM_B })),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining('is not present in table "studies"'),
      });
    });

    it('holds participant identity immutable and refuses unmarked deletes', async () => {
      const { studyId, participantId } = await newTrio();
      const otherStudyId = await newStudy();

      await expect(
        pool.query(`UPDATE participants SET study_id = $2 WHERE id = $1`, [
          participantId,
          otherStudyId,
        ]),
      ).rejects.toThrow('participant identity is immutable');
      await expect(
        pool.query(
          `UPDATE participants SET timezone = 'Europe/Paris' WHERE id = $1`,
          [participantId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      await expect(
        tenantA.query(`DELETE FROM participants WHERE id = $1`, [
          participantId,
        ]),
      ).rejects.toThrow(
        'participant rows are deleted only by an audited erasure or the maintenance purge',
      );
      expect(studyId).toBeTruthy();
    });

    it('proves the erasure marker against the row it deletes', async () => {
      const studyId = await newStudy();
      const target = await newParticipant(studyId);
      const bystander = await newParticipant(studyId);

      await expect(
        erasing(bystander, `DELETE FROM participants WHERE id = $1`, [target]),
      ).rejects.toThrow(
        'participant rows are deleted only by an audited erasure or the maintenance purge',
      );
      await expect(
        erasing(target, `DELETE FROM participants WHERE id = $1`, [target]),
      ).resolves.toMatchObject({ rowCount: 1 });

      const survivors = await pool.query(
        `SELECT id FROM participants WHERE study_id = $1`,
        [studyId],
      );
      expect(survivors.rows).toEqual([{ id: bystander }]);
    });
  });

  describe('interview_sessions', () => {
    it('applies the documented defaults', async () => {
      const { studyId, waveId } = await newTrio();
      const sessionId = await newSession(studyId, waveId);

      const row = await pool.query<Row>(
        `SELECT status, delivery_mode, current_stage_index, current_stage_id,
                stage_metadata, ego_attributes, ego_secure_attributes,
                holder_id, holder_epoch, completed_at, abandoned_at
         FROM interview_sessions WHERE id = $1`,
        [sessionId],
      );
      expect(row.rows[0]).toEqual({
        status: 'in_progress',
        delivery_mode: 'self_administered',
        current_stage_index: 0,
        current_stage_id: null,
        stage_metadata: {},
        ego_attributes: {},
        ego_secure_attributes: null,
        holder_id: null,
        holder_epoch: '0',
        completed_at: null,
        abandoned_at: null,
      });
    });

    it.each([
      [
        'an unknown status',
        { status: 'paused' },
        'interview_sessions_status_check',
      ],
      [
        'a researcher-led session with no initiator',
        { delivery_mode: 'researcher_led' },
        'interview_sessions_delivery_mode_check',
      ],
      [
        'a self-administered session with an initiator',
        { initiated_by_user_id: 'user-1' },
        'interview_sessions_delivery_mode_check',
      ],
      [
        'a completed status with no completion timestamp',
        { status: 'completed' },
        'interview_sessions_terminal_state_check',
      ],
      [
        'a completion timestamp without the completed status',
        { completed_at: new Date() },
        'interview_sessions_terminal_state_check',
      ],
      [
        'an abandoned status with no abandonment timestamp',
        { status: 'abandoned' },
        'interview_sessions_terminal_state_check',
      ],
      [
        'a negative stage index',
        { current_stage_index: -1 },
        'interview_sessions_stage_check',
      ],
      [
        'an empty stage id',
        { current_stage_id: '' },
        'interview_sessions_stage_check',
      ],
      [
        'a negative holder epoch',
        { holder_epoch: '-1' },
        'interview_sessions_holder_check',
      ],
      ['an empty ego uid', { ego_uid: '' }, 'interview_sessions_ego_check'],
      [
        'scalar ego attributes',
        { ego_attributes: JSON.stringify(1) },
        'interview_sessions_ego_check',
      ],
      [
        'scalar stage metadata',
        { stage_metadata: JSON.stringify('x') },
        'interview_sessions_ego_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const { studyId, waveId } = await newTrio();
      await expect(
        insert('interview_sessions', sessionRow(studyId, waveId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts a researcher-led session that names its initiator', async () => {
      const { studyId, waveId } = await newTrio();
      await expect(
        insert(
          'interview_sessions',
          sessionRow(studyId, waveId, {
            delivery_mode: 'researcher_led',
            initiated_by_user_id: 'user-1',
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a wave from one study and a participant from another', async () => {
      const studyA = await newStudy();
      const waveA = await newWave(studyA);
      const studyB = await newStudy();
      const participantB = await newParticipant(studyB);

      // Naming study A leaves the participant unfindable...
      await expect(
        insert(
          'interview_sessions',
          sessionRow(studyA, waveA, { participant_id: participantB }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "participants"',
        ),
      });
      // ...and naming study B leaves the wave unfindable.
      await expect(
        insert(
          'interview_sessions',
          sessionRow(studyB, waveA, { participant_id: participantB }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "study_waves"',
        ),
      });

      const participantA = await newParticipant(studyA);
      await expect(
        insert(
          'interview_sessions',
          sessionRow(studyA, waveA, { participant_id: participantA }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a session pinning a version its wave does not', async () => {
      const studyId = await newStudy();
      const waveId = await newWave(studyId);
      // A second version of the study's OWN line: the team-scoped key admits
      // it, and only the wave's pin says the session never ran it.
      const secondVersionId = await newVersion(protocolOf[TEAM_A]!, 2);
      const refused =
        'an interview session must pin the protocol version its wave pins';

      await expect(
        insert(
          'interview_sessions',
          sessionRow(studyId, waveId, {
            protocol_version_id: secondVersionId,
          }),
        ),
      ).rejects.toThrow(refused);

      // A wave that pins nothing takes no sessions at all.
      const unpinnedWaveId = await newWave(studyId, {
        wave_number: 2,
        protocol_version_id: null,
      });
      await expect(
        insert('interview_sessions', sessionRow(studyId, unpinnedWaveId)),
      ).rejects.toThrow(refused);

      // The session copies the wave's pin, and keeps its copy when the wave
      // moves on: that is the whole reason it carries one.
      const sessionId = await newSession(studyId, waveId);
      await expect(
        pool.query(
          `UPDATE study_waves SET protocol_version_id = $2 WHERE id = $1`,
          [waveId, secondVersionId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      const stored = await pool.query<{ protocol_version_id: string }>(
        `SELECT protocol_version_id FROM interview_sessions WHERE id = $1`,
        [sessionId],
      );
      expect(stored.rows[0]?.protocol_version_id).toBe(versionOf[TEAM_A]);
    });

    it('refuses a link that opens another wave or another participant', async () => {
      const { studyId, waveId, participantId } = await newTrio();
      const otherWaveId = await newWave(studyId, { wave_number: 2 });
      const otherParticipantId = await newParticipant(studyId);
      const link = async (overrides: Row): Promise<string> => {
        const row = linkRow(studyId, waveId, overrides);
        await insert('interview_links', row);
        return row.id as string;
      };
      const ownLink = await link({
        kind: 'participant',
        participant_id: participantId,
      });
      const otherWaveLink = await link({
        wave_id: otherWaveId,
        kind: 'participant',
        participant_id: participantId,
      });
      const otherParticipantLink = await link({
        kind: 'participant',
        participant_id: otherParticipantId,
      });
      const openLink = await link({});
      const refused =
        "an interview session's link must open its own wave for its own participant";

      // All four links are the team's, so the key admits them; the session
      // must open this wave for this participant, or for any visitor.
      await expect(
        newSession(studyId, waveId, {
          participant_id: participantId,
          link_id: otherWaveLink,
        }),
      ).rejects.toThrow(refused);
      await expect(
        newSession(studyId, waveId, {
          participant_id: participantId,
          link_id: otherParticipantLink,
        }),
      ).rejects.toThrow(refused);
      await expect(
        newSession(studyId, waveId, {
          participant_id: participantId,
          link_id: openLink,
        }),
      ).rejects.toThrow(refused);
      await expect(
        newSession(studyId, waveId, { link_id: ownLink }),
      ).rejects.toThrow(refused);
      const sessionId = await newSession(studyId, waveId, {
        participant_id: participantId,
        link_id: ownLink,
      });
      // Rebinding a live session to another link is proven the same way.
      await expect(
        pool.query(`UPDATE interview_sessions SET link_id = $2 WHERE id = $1`, [
          sessionId,
          otherWaveLink,
        ]),
      ).rejects.toThrow(refused);
      // An anonymous visitor through the open link.
      await expect(
        newSession(studyId, waveId, { link_id: openLink }),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
    });

    it('refuses a session whose team disagrees with its wave', async () => {
      const { studyId, waveId } = await newTrio();
      await expect(
        insert(
          'interview_sessions',
          sessionRow(studyId, waveId, {
            team_id: TEAM_B,
            protocol_version_id: versionOf[TEAM_B],
          }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "study_waves"',
        ),
      });
    });

    it('allows one live session per participant per wave', async () => {
      const { studyId, waveId, participantId } = await newTrio();
      await newSession(studyId, waveId, { participant_id: participantId });

      await expect(
        insert(
          'interview_sessions',
          sessionRow(studyId, waveId, { participant_id: participantId }),
        ),
      ).rejects.toMatchObject({
        constraint: 'interview_sessions_wave_id_participant_id_idx',
      });

      // The index is partial, so anonymous sessions are unlimited.
      await expect(
        insert('interview_sessions', sessionRow(studyId, waveId)),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert('interview_sessions', sessionRow(studyId, waveId)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('freezes a finalized session and erases it only under its own marker', async () => {
      const { studyId, waveId, participantId } = await newTrio();
      const sessionId = await newSession(studyId, waveId, {
        participant_id: participantId,
      });
      const bystander = await newParticipant(studyId);

      // Finalizing is itself an ordinary update — paired with the snapshot the
      // deferred completion guard requires of it.
      await finalize(sessionId);

      await expect(
        pool.query(
          `UPDATE interview_sessions SET last_activity_at = now() WHERE id = $1`,
          [sessionId],
        ),
      ).rejects.toThrow('finalized interview sessions are immutable');
      await expect(
        tenantA.query(`DELETE FROM interview_sessions WHERE id = $1`, [
          sessionId,
        ]),
      ).rejects.toThrow(
        'interview sessions are deleted only by an audited erasure or the maintenance purge',
      );
      await expect(
        erasing(bystander, `DELETE FROM interview_sessions WHERE id = $1`, [
          sessionId,
        ]),
      ).rejects.toThrow(
        'interview sessions are deleted only by an audited erasure or the maintenance purge',
      );
      // Bottom-up, the order every delete path follows: the snapshot the
      // finalization had to write is the session's child, and no key cascades.
      await erasing(
        participantId,
        `DELETE FROM session_snapshots WHERE session_id = $1`,
        [sessionId],
      );
      await expect(
        erasing(participantId, `DELETE FROM interview_sessions WHERE id = $1`, [
          sessionId,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('holds the identity and version pin of a live session immutable', async () => {
      const { studyId, waveId } = await newTrio();
      const otherWaveId = await newWave(studyId, { wave_number: 2 });
      const sessionId = await newSession(studyId, waveId);

      await expect(
        pool.query(`UPDATE interview_sessions SET wave_id = $2 WHERE id = $1`, [
          sessionId,
          otherWaveId,
        ]),
      ).rejects.toThrow(
        'interview session identity and version pin are immutable',
      );
      await expect(
        pool.query(
          `UPDATE interview_sessions SET started_at = now() WHERE id = $1`,
          [sessionId],
        ),
      ).rejects.toThrow(
        'interview session identity and version pin are immutable',
      );
      await expect(
        pool.query(
          `UPDATE interview_sessions SET current_stage_index = 3 WHERE id = $1`,
          [sessionId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses writes under a closed study', async () => {
      const { studyId, waveId } = await newTrio();
      const sessionId = await newSession(studyId, waveId);
      await closeStudy(studyId);

      await expect(
        insert('interview_sessions', sessionRow(studyId, waveId)),
      ).rejects.toThrow('closed studies are read-only');
      await expect(
        pool.query(
          `UPDATE interview_sessions SET current_stage_index = 1 WHERE id = $1`,
          [sessionId],
        ),
      ).rejects.toThrow('closed studies are read-only');
    });
  });

  describe('interview_links', () => {
    it('applies the documented defaults', async () => {
      const { studyId, waveId } = await newTrio();
      const row = linkRow(studyId, waveId);
      await insert('interview_links', row);

      const stored = await pool.query<Row>(
        `SELECT kind, participant_id, expires_at, revoked_at, redemption_count,
                last_redeemed_at, created_by_user_id
         FROM interview_links WHERE id = $1`,
        [row.id],
      );
      expect(stored.rows[0]).toEqual({
        kind: 'anonymous',
        participant_id: null,
        expires_at: null,
        revoked_at: null,
        redemption_count: 0,
        last_redeemed_at: null,
        created_by_user_id: null,
      });
    });

    it.each([
      ['an unknown kind', { kind: 'magic' }, 'interview_links_kind_check'],
      [
        'a negative redemption count',
        { redemption_count: -1 },
        'interview_links_redemption_count_check',
      ],
      [
        'a redemption count with no redemption timestamp',
        { redemption_count: 1 },
        'interview_links_redemption_count_check',
      ],
      [
        'a redemption timestamp with no count',
        { last_redeemed_at: new Date() },
        'interview_links_redemption_count_check',
      ],
      [
        'a token hash that is not 32 bytes',
        { token_hash: randomBytes(31) },
        'interview_links_token_hash_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const { studyId, waveId } = await newTrio();
      await expect(
        insert('interview_links', linkRow(studyId, waveId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('binds the link kind to the presence of a participant', async () => {
      const { studyId, waveId, participantId } = await newTrio();

      await expect(
        insert(
          'interview_links',
          linkRow(studyId, waveId, { kind: 'participant' }),
        ),
      ).rejects.toMatchObject({ constraint: 'interview_links_kind_check' });
      await expect(
        insert(
          'interview_links',
          linkRow(studyId, waveId, {
            kind: 'anonymous',
            participant_id: participantId,
          }),
        ),
      ).rejects.toMatchObject({ constraint: 'interview_links_kind_check' });
      await expect(
        insert(
          'interview_links',
          linkRow(studyId, waveId, {
            kind: 'participant',
            participant_id: participantId,
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('allows one live participant link per wave, and a reissue after revocation', async () => {
      const { studyId, waveId, participantId } = await newTrio();
      const first = linkRow(studyId, waveId, {
        kind: 'participant',
        participant_id: participantId,
      });
      await insert('interview_links', first);

      await expect(
        insert(
          'interview_links',
          linkRow(studyId, waveId, {
            kind: 'participant',
            participant_id: participantId,
          }),
        ),
      ).rejects.toMatchObject({
        constraint: 'interview_links_live_participant_idx',
      });

      await pool.query(
        `UPDATE interview_links SET revoked_at = now() WHERE id = $1`,
        [first.id],
      );
      await expect(
        insert(
          'interview_links',
          linkRow(studyId, waveId, {
            kind: 'participant',
            participant_id: participantId,
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses a duplicate token hash inside a team', async () => {
      const { studyId, waveId } = await newTrio();
      const tokenHash = randomBytes(32);
      await insert(
        'interview_links',
        linkRow(studyId, waveId, { token_hash: tokenHash }),
      );

      await expect(
        insert(
          'interview_links',
          linkRow(studyId, waveId, { token_hash: tokenHash }),
        ),
      ).rejects.toMatchObject({
        constraint: 'interview_links_team_id_token_hash_idx',
      });
    });

    it('refuses a link whose wave belongs to another study', async () => {
      const studyA = await newStudy();
      const waveA = await newWave(studyA);
      const studyB = await newStudy();

      await expect(
        insert('interview_links', linkRow(studyB, waveA)),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining(
          'is not present in table "study_waves"',
        ),
      });
    });

    it('holds the token and identity immutable, and erases with its participant', async () => {
      const { studyId, waveId, participantId } = await newTrio();
      const row = linkRow(studyId, waveId, {
        kind: 'participant',
        participant_id: participantId,
      });
      await insert('interview_links', row);
      const bystander = await newParticipant(studyId);

      await expect(
        pool.query(`UPDATE interview_links SET token_hash = $2 WHERE id = $1`, [
          row.id,
          randomBytes(32),
        ]),
      ).rejects.toThrow('interview link identity and token are immutable');
      await expect(
        pool.query(
          `UPDATE interview_links SET expires_at = now() WHERE id = $1`,
          [row.id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      await expect(
        tenantA.query(`DELETE FROM interview_links WHERE id = $1`, [row.id]),
      ).rejects.toThrow(
        'interview links are deleted only by an audited erasure or the maintenance purge',
      );
      await expect(
        erasing(bystander, `DELETE FROM interview_links WHERE id = $1`, [
          row.id,
        ]),
      ).rejects.toThrow(
        'interview links are deleted only by an audited erasure or the maintenance purge',
      );
      await expect(
        erasing(participantId, `DELETE FROM interview_links WHERE id = $1`, [
          row.id,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });
});
