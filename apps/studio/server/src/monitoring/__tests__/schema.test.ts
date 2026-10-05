// The monitoring module's database-enforced promises: a rollup is keyed once
// per wave and once per (wave, stage), every count is non-negative, and the
// three-column wave key refuses a wave belonging to another team or another
// study.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK or unique violation, the referenced table for a foreign-key
// violation — so a guard that stopped firing cannot pass as "no error".
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';

const db = await reachableDb();

const TEAM_A = 'monitoring-team-a';
const TEAM_B = 'monitoring-team-b';

type Row = Record<string, unknown>;

describe.skipIf(!db)('monitoring rollup schema', () => {
  let pool: pg.Pool;
  let dispose: () => Promise<void>;

  /** Per team: one study with one wave. */
  const studyOf: Record<string, string> = {};
  const waveOf: Record<string, string> = {};
  /** A second team-A study and wave, for the cross-study oracle. */
  let otherStudyId: string;
  let otherWaveId: string;
  /**
   * A second wave in that study, carrying no rollup of its own. The primary
   * keys here are the wave, so a cross-study oracle reusing `otherWaveId`
   * would trip the unique violation before the foreign key was ever consulted.
   */
  let spareWaveId: string;

  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  const waveRollupRow = (overrides: Row = {}): Row => ({
    team_id: TEAM_A,
    study_id: studyOf[TEAM_A],
    wave_id: waveOf[TEAM_A],
    ...overrides,
  });

  const stageRollupRow = (overrides: Row = {}): Row => ({
    team_id: TEAM_A,
    study_id: studyOf[TEAM_A],
    wave_id: waveOf[TEAM_A],
    stage_id: 'name-generator-1',
    ...overrides,
  });

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);

    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const studyId = randomUUID();
      const waveId = randomUUID();
      studyOf[teamId] = studyId;
      waveOf[teamId] = waveId;
      await insert('studies', {
        id: studyId,
        team_id: teamId,
        name: `${teamId} study`,
      });
      await insert('study_waves', {
        id: waveId,
        study_id: studyId,
        team_id: teamId,
        wave_number: 1,
      });
    }

    otherStudyId = randomUUID();
    otherWaveId = randomUUID();
    await insert('studies', {
      id: otherStudyId,
      team_id: TEAM_A,
      name: 'second team-a study',
    });
    await insert('study_waves', {
      id: otherWaveId,
      study_id: otherStudyId,
      team_id: TEAM_A,
      wave_number: 1,
    });
    spareWaveId = randomUUID();
    await insert('study_waves', {
      id: spareWaveId,
      study_id: otherStudyId,
      team_id: TEAM_A,
      wave_number: 2,
    });
  });

  afterAll(async () => {
    await dispose();
  });

  describe('study_wave_rollups', () => {
    it('starts every count at zero and unstale', async () => {
      await insert('study_wave_rollups', waveRollupRow());

      const row = await pool.query<Row>(
        `SELECT invited_count, onboarding_started_count, consented_count,
                session_started_count, session_completed_count,
                session_abandoned_count, delivery_failed_count, stale_at
         FROM study_wave_rollups WHERE wave_id = $1`,
        [waveOf[TEAM_A]],
      );
      expect(row.rows[0]).toEqual({
        invited_count: 0,
        onboarding_started_count: 0,
        consented_count: 0,
        session_started_count: 0,
        session_completed_count: 0,
        session_abandoned_count: 0,
        delivery_failed_count: 0,
        stale_at: null,
      });
    });

    it('holds one rollup per wave', async () => {
      await insert(
        'study_wave_rollups',
        waveRollupRow({ wave_id: otherWaveId, study_id: otherStudyId }),
      );

      await expect(
        insert(
          'study_wave_rollups',
          waveRollupRow({ wave_id: otherWaveId, study_id: otherStudyId }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'study_wave_rollups_pkey',
      });
    });

    it.each([
      ['invited_count'],
      ['onboarding_started_count'],
      ['consented_count'],
      ['session_started_count'],
      ['session_completed_count'],
      ['session_abandoned_count'],
      ['delivery_failed_count'],
    ])('rejects a negative %s', async (column) => {
      await expect(
        insert(
          'study_wave_rollups',
          waveRollupRow({ wave_id: randomUUID(), [column]: -1 }),
        ),
      ).rejects.toMatchObject({
        constraint: 'study_wave_rollups_counts_check',
      });
    });

    it('refuses a wave from another team', async () => {
      await expect(
        insert(
          'study_wave_rollups',
          waveRollupRow({ wave_id: waveOf[TEAM_B] }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'study_wave_rollups_wave_fk',
        detail: expect.stringContaining(
          'is not present in table "study_waves"',
        ),
      });
    });

    it('refuses a wave from another study in the same team', async () => {
      await expect(
        insert('study_wave_rollups', waveRollupRow({ wave_id: spareWaveId })),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'study_wave_rollups_wave_fk',
      });
    });
  });

  describe('study_stage_rollups', () => {
    it('starts every count at zero, duration as a sum and a count', async () => {
      await insert('study_stage_rollups', stageRollupRow());

      const row = await pool.query<Row>(
        `SELECT entered_count, completed_count, abandoned_count,
                duration_ms_sum, duration_ms_count, missing_item_count, stale_at
         FROM study_stage_rollups WHERE wave_id = $1 AND stage_id = $2`,
        [waveOf[TEAM_A], 'name-generator-1'],
      );
      expect(row.rows[0]).toEqual({
        entered_count: 0,
        completed_count: 0,
        abandoned_count: 0,
        // bigint arrives as a string over the wire.
        duration_ms_sum: '0',
        duration_ms_count: 0,
        missing_item_count: 0,
        stale_at: null,
      });
    });

    it('holds one rollup per wave and stage', async () => {
      await insert(
        'study_stage_rollups',
        stageRollupRow({ stage_id: 'sociogram-1' }),
      );

      await expect(
        insert(
          'study_stage_rollups',
          stageRollupRow({ stage_id: 'sociogram-1', entered_count: 5 }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'study_stage_rollups_pkey',
      });

      // A different stage in the same wave is a different row …
      await expect(
        insert(
          'study_stage_rollups',
          stageRollupRow({ stage_id: 'sociogram-2' }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      // … and so is the same stage id in another wave.
      await expect(
        insert(
          'study_stage_rollups',
          stageRollupRow({
            stage_id: 'sociogram-1',
            wave_id: otherWaveId,
            study_id: otherStudyId,
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      ['entered_count'],
      ['completed_count'],
      ['abandoned_count'],
      ['duration_ms_sum'],
      ['duration_ms_count'],
      ['missing_item_count'],
    ])('rejects a negative %s', async (column) => {
      await expect(
        insert(
          'study_stage_rollups',
          stageRollupRow({ stage_id: `neg-${column}`, [column]: -1 }),
        ),
      ).rejects.toMatchObject({
        constraint: 'study_stage_rollups_counts_check',
      });
    });

    it.each([
      ['a blank stage id', ''],
      ['a stage id past 128 characters', 'x'.repeat(129)],
    ])('rejects %s', async (_label, stageId) => {
      await expect(
        insert('study_stage_rollups', stageRollupRow({ stage_id: stageId })),
      ).rejects.toMatchObject({
        constraint: 'study_stage_rollups_counts_check',
      });
    });

    it('refuses a wave from another team', async () => {
      await expect(
        insert(
          'study_stage_rollups',
          stageRollupRow({ wave_id: waveOf[TEAM_B] }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'study_stage_rollups_wave_fk',
        detail: expect.stringContaining(
          'is not present in table "study_waves"',
        ),
      });
    });

    it('refuses a wave from another study in the same team', async () => {
      await expect(
        insert('study_stage_rollups', stageRollupRow({ wave_id: spareWaveId })),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'study_stage_rollups_wave_fk',
      });
    });
  });
});
