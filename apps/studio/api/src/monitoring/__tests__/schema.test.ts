import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import {
  insertTeam,
  ownerRows,
  refusalOf,
  TestDatabaseLive,
  testDb,
  ownerInsert,
} from '../../__tests__/support/database.ts';

const TEAM_A = 'monitoring-team-a';
const TEAM_B = 'monitoring-team-b';

type Row = Record<string, unknown>;

const studyOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
const waveOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
const otherStudyId = randomUUID();
const otherWaveId = randomUUID();
const spareWaveId = randomUUID();

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

const Fixtures = Layer.effectDiscard(
  Effect.gen(function* () {
    for (const teamId of [TEAM_A, TEAM_B]) {
      yield* insertTeam(teamId);
      yield* ownerInsert('studies', {
        id: studyOf[teamId],
        team_id: teamId,
        name: `${teamId} study`,
      });
      yield* ownerInsert('study_waves', {
        id: waveOf[teamId],
        study_id: studyOf[teamId],
        team_id: teamId,
        wave_number: 1,
      });
    }

    yield* ownerInsert('studies', {
      id: otherStudyId,
      team_id: TEAM_A,
      name: 'second team-a study',
    });
    yield* ownerInsert('study_waves', {
      id: otherWaveId,
      study_id: otherStudyId,
      team_id: TEAM_A,
      wave_number: 1,
    });
    yield* ownerInsert('study_waves', {
      id: spareWaveId,
      study_id: otherStudyId,
      team_id: TEAM_A,
      wave_number: 2,
    });
  }),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('monitoring rollup schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    describe('study_wave_rollups', () => {
      it.effect('starts every count at zero and unstale', () =>
        Effect.gen(function* () {
          yield* ownerInsert('study_wave_rollups', waveRollupRow());

          const rows = yield* ownerRows(
            `SELECT invited_count, onboarding_started_count, consented_count,
                    session_started_count, session_completed_count,
                    session_abandoned_count, delivery_failed_count, stale_at
             FROM study_wave_rollups WHERE wave_id = $1`,
            [waveOf[TEAM_A]],
          );
          expect(rows[0]).toEqual({
            invited_count: 0,
            onboarding_started_count: 0,
            consented_count: 0,
            session_started_count: 0,
            session_completed_count: 0,
            session_abandoned_count: 0,
            delivery_failed_count: 0,
            stale_at: null,
          });
        }),
      );

      it.effect('holds one rollup per wave', () =>
        Effect.gen(function* () {
          yield* ownerInsert(
            'study_wave_rollups',
            waveRollupRow({ wave_id: otherWaveId, study_id: otherStudyId }),
          );

          const refused = yield* refusalOf(
            ownerInsert(
              'study_wave_rollups',
              waveRollupRow({ wave_id: otherWaveId, study_id: otherStudyId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23505',
            constraint: 'study_wave_rollups_pkey',
          });
        }),
      );

      it.effect.each([
        'invited_count',
        'onboarding_started_count',
        'consented_count',
        'session_started_count',
        'session_completed_count',
        'session_abandoned_count',
        'delivery_failed_count',
      ])('rejects a negative %s', (column) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_wave_rollups',
              waveRollupRow({ wave_id: randomUUID(), [column]: -1 }),
            ),
          );
          expect(refused.constraint).toBe('study_wave_rollups_counts_check');
        }),
      );

      it.effect('refuses a wave from another team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_wave_rollups',
              waveRollupRow({ wave_id: waveOf[TEAM_B] }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'study_wave_rollups_wave_fk',
            detail: expect.stringContaining(
              'is not present in table "study_waves"',
            ),
          });
        }),
      );

      it.effect('refuses a wave from another study in the same team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_wave_rollups',
              waveRollupRow({ wave_id: spareWaveId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'study_wave_rollups_wave_fk',
          });
        }),
      );
    });

    describe('study_stage_rollups', () => {
      it.effect(
        'starts every count at zero, duration as a sum and a count',
        () =>
          Effect.gen(function* () {
            yield* ownerInsert('study_stage_rollups', stageRollupRow());

            const rows = yield* ownerRows(
              `SELECT entered_count, completed_count, abandoned_count,
                      duration_ms_sum, duration_ms_count, missing_item_count,
                      stale_at
               FROM study_stage_rollups WHERE wave_id = $1 AND stage_id = $2`,
              [waveOf[TEAM_A], 'name-generator-1'],
            );
            expect(rows[0]).toEqual({
              entered_count: 0,
              completed_count: 0,
              abandoned_count: 0,
              // The driver decodes int8 as a bigint.
              duration_ms_sum: 0n,
              duration_ms_count: 0,
              missing_item_count: 0,
              stale_at: null,
            });
          }),
      );

      it.effect('holds one rollup per wave and stage', () =>
        Effect.gen(function* () {
          yield* ownerInsert(
            'study_stage_rollups',
            stageRollupRow({ stage_id: 'sociogram-1' }),
          );

          const refused = yield* refusalOf(
            ownerInsert(
              'study_stage_rollups',
              stageRollupRow({ stage_id: 'sociogram-1', entered_count: 5 }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23505',
            constraint: 'study_stage_rollups_pkey',
          });

          expect(
            yield* ownerInsert(
              'study_stage_rollups',
              stageRollupRow({ stage_id: 'sociogram-2' }),
            ),
          ).toBe(1);

          expect(
            yield* ownerInsert(
              'study_stage_rollups',
              stageRollupRow({
                stage_id: 'sociogram-1',
                wave_id: otherWaveId,
                study_id: otherStudyId,
              }),
            ),
          ).toBe(1);
        }),
      );

      it.effect.each([
        'entered_count',
        'completed_count',
        'abandoned_count',
        'duration_ms_sum',
        'duration_ms_count',
        'missing_item_count',
      ])('rejects a negative %s', (column) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_stage_rollups',
              stageRollupRow({ stage_id: `neg-${column}`, [column]: -1 }),
            ),
          );
          expect(refused.constraint).toBe('study_stage_rollups_counts_check');
        }),
      );

      it.effect.each<readonly [label: string, stageId: string]>([
        ['a blank stage id', ''],
        ['a stage id past 128 characters', 'x'.repeat(129)],
      ])('rejects %s', ([_label, stageId]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_stage_rollups',
              stageRollupRow({ stage_id: stageId }),
            ),
          );
          expect(refused.constraint).toBe('study_stage_rollups_counts_check');
        }),
      );

      it.effect('refuses a wave from another team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_stage_rollups',
              stageRollupRow({ wave_id: waveOf[TEAM_B] }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'study_stage_rollups_wave_fk',
            detail: expect.stringContaining(
              'is not present in table "study_waves"',
            ),
          });
        }),
      );

      it.effect('refuses a wave from another study in the same team', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'study_stage_rollups',
              stageRollupRow({ wave_id: spareWaveId }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'study_stage_rollups_wave_fk',
          });
        }),
      );
    });
  });
});
