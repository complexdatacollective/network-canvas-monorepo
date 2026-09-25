// The experiment module's database-enforced promises: the variant list and
// lifecycle checks on an experiment, the element-level proof that makes the
// list a list of arms, one sticky assignment per subject, the composite
// foreign keys that keep an assignment and its exposures inside one team, and
// the sidecar triggers that make an assignment and an exposure unrewritable
// and undeletable while leaving the erasure delete path open.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import {
  insertTeam,
  ownerAffected,
  ownerRows,
  refusalOf,
  TestDatabaseLive,
  testDb,
  erasing,
  maintenanceAffected,
  ownerInsert,
  tenantRows,
} from '../../__tests__/support/database.ts';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

const TWO_VARIANTS = JSON.stringify([
  { key: 'control', weight: 1 },
  { key: 'treatment', weight: 1 },
]);
const THREE_VARIANTS = JSON.stringify([
  { key: 'control', weight: 1 },
  { key: 'treatment', weight: 1 },
  { key: 'treatment_b', weight: 1 },
]);

/** One experiment per team, so cross-team pins have a target. */
const experimentOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
/** One assignment per team, for the exposure pins. */
const assignmentOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};

const experimentRow = (overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  key: `layout_${randomUUID().slice(0, 8)}`,
  name: 'Sociogram layout affordance',
  surface: 'researcher',
  variants: TWO_VARIANTS,
  ...overrides,
});

const assignmentRow = (experimentId: string, overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  experiment_id: experimentId,
  subject_kind: 'user',
  subject_id: `user-${randomUUID().slice(0, 8)}`,
  variant_key: 'control',
  ...overrides,
});

const exposureRow = (
  experimentId: string,
  assignmentId: string,
  overrides: Row = {},
): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  experiment_id: experimentId,
  assignment_id: assignmentId,
  variant_key: 'control',
  surface_key: 'sociogram.layout',
  ...overrides,
});

const newExperiment = (overrides: Row = {}) => {
  const row = experimentRow(overrides);
  return Effect.as(ownerInsert('experiments', row), row.id as string);
};

const newAssignment = (experimentId: string, overrides: Row = {}) => {
  const row = assignmentRow(experimentId, overrides);
  return Effect.as(
    ownerInsert('experiment_assignments', row),
    row.id as string,
  );
};

const newExposure = (
  experimentId: string,
  assignmentId: string,
  overrides: Row = {},
) => {
  const row = exposureRow(experimentId, assignmentId, overrides);
  return Effect.as(ownerInsert('experiment_exposures', row), row.id as string);
};

/** An assignment of a participant subject, which erasure can reach. */
const newParticipantAssignment = (participantId: string) =>
  newAssignment(experimentOf[TEAM_A] as string, {
    subject_kind: 'participant',
    subject_id: participantId,
  });

/** What a refused statement said, every message down the chain joined. */
const refusalMessage = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(refusalOf(effect), (refused) => refused.message);

/** Both teams, a running experiment and an assignment each, once for the file. */
const Fixtures = Layer.effectDiscard(
  Effect.forEach([TEAM_A, TEAM_B], (teamId) =>
    Effect.gen(function* () {
      yield* insertTeam(teamId);
      const experimentId = experimentOf[teamId] as string;
      // Running, so the fixture assignment and the exposures the cases
      // below add lie within the experiment's lifetime.
      yield* ownerInsert(
        'experiments',
        experimentRow({
          id: experimentId,
          team_id: teamId,
          state: 'running',
          started_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        }),
      );
      yield* ownerInsert(
        'experiment_assignments',
        assignmentRow(experimentId, {
          id: assignmentOf[teamId],
          team_id: teamId,
        }),
      );
    }),
  ),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('experiment schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    describe('experiments', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const id = yield* newExperiment();

          const rows = yield* ownerRows(
            `SELECT state, started_at, stopped_at FROM experiments WHERE id = $1`,
            [id],
          );
          expect(rows[0]).toEqual({
            state: 'draft',
            started_at: null,
            stopped_at: null,
          });
        }),
      );

      it.effect.each<
        readonly [label: string, overrides: Row, constraint: string]
      >([
        [
          'an unknown surface',
          { surface: 'admin' },
          'experiments_surface_check',
        ],
        ['an unknown state', { state: 'archived' }, 'experiments_state_check'],
        [
          'a draft carrying a start timestamp',
          { started_at: new Date() },
          'experiments_state_check',
        ],
        [
          'a running experiment that never started',
          { state: 'running' },
          'experiments_state_check',
        ],
        [
          'a stopped experiment with no stop timestamp',
          { state: 'stopped', started_at: new Date() },
          'experiments_state_check',
        ],
        [
          'a stop timestamp on a running experiment',
          { state: 'running', started_at: new Date(), stopped_at: new Date() },
          'experiments_state_check',
        ],
        [
          'a single-variant experiment',
          { variants: JSON.stringify([{ key: 'control', weight: 1 }]) },
          'experiments_variants_check',
        ],
        [
          'more than ten variants',
          {
            variants: JSON.stringify(
              Array.from({ length: 11 }, (_, i) => ({
                key: `v${i}`,
                weight: 1,
              })),
            ),
          },
          'experiments_variants_check',
        ],
        [
          'an object where the variant list belongs',
          { variants: JSON.stringify({ control: 1, treatment: 1 }) },
          'experiments_variants_check',
        ],
        [
          'a key that starts with a digit',
          { key: '1layout' },
          'experiments_key_check',
        ],
        ['a one-character key', { key: 'a' }, 'experiments_key_check'],
        ['an upper-case key', { key: 'Layout' }, 'experiments_key_check'],
        [
          'a key past 64 characters',
          { key: `a${'b'.repeat(64)}` },
          'experiments_key_check',
        ],
        ['a blank name', { name: '' }, 'experiments_key_check'],
        [
          'a name past 200 characters',
          { name: 'n'.repeat(201) },
          'experiments_key_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('experiments', experimentRow(overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('accepts the lifecycle states the checks exist to admit', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'experiments',
              experimentRow({ state: 'running', started_at: new Date() }),
            ),
          ).toBe(1);
          expect(
            yield* ownerInsert(
              'experiments',
              experimentRow({
                state: 'stopped',
                started_at: new Date(),
                stopped_at: new Date(),
              }),
            ),
          ).toBe(1);
          expect(
            yield* ownerInsert(
              'experiments',
              experimentRow({ surface: 'participant' }),
            ),
          ).toBe(1);
        }),
      );

      // `experiments_variants_check` sees an array of the right length and
      // stops. Every shape below satisfies it, and every one of them would
      // corrupt the randomiser that reads the list as a set of arms.
      it.effect.each<
        readonly [label: string, variants: string, message: string]
      >([
        [
          'a list of nulls',
          JSON.stringify([null, null]),
          'every experiment variant must be an object carrying a key and a weight',
        ],
        [
          'bare strings where the arms belong',
          JSON.stringify(['control', 'treatment']),
          'every experiment variant must be an object carrying a key and a weight',
        ],
        [
          'a nested list',
          JSON.stringify([
            ['control', 1],
            ['treatment', 1],
          ]),
          'every experiment variant must be an object carrying a key and a weight',
        ],
        [
          'an arm with no key',
          JSON.stringify([{ weight: 1 }, { key: 'treatment', weight: 1 }]),
          'the experiment variant key (missing) is not a well-formed key',
        ],
        [
          'a null key',
          JSON.stringify([
            { key: null, weight: 1 },
            { key: 'treatment', weight: 1 },
          ]),
          'the experiment variant key (missing) is not a well-formed key',
        ],
        [
          'an upper-case key',
          JSON.stringify([
            { key: 'Control', weight: 1 },
            { key: 'treatment', weight: 1 },
          ]),
          'the experiment variant key Control is not a well-formed key',
        ],
        [
          'a key that starts with a digit',
          JSON.stringify([
            { key: '1control', weight: 1 },
            { key: 'treatment', weight: 1 },
          ]),
          'the experiment variant key 1control is not a well-formed key',
        ],
        [
          'a key past 64 characters',
          JSON.stringify([
            { key: `a${'b'.repeat(64)}`, weight: 1 },
            { key: 'treatment', weight: 1 },
          ]),
          `the experiment variant key a${'b'.repeat(64)} is not a well-formed key`,
        ],
        [
          'two arms under one key',
          JSON.stringify([
            { key: 'control', weight: 1 },
            { key: 'control', weight: 2 },
          ]),
          'the experiment variant key control is used twice',
        ],
        [
          'a zero weight',
          JSON.stringify([
            { key: 'control', weight: 0 },
            { key: 'treatment', weight: 1 },
          ]),
          'the experiment variant control must carry a positive integer weight',
        ],
        [
          'a negative weight',
          JSON.stringify([
            { key: 'control', weight: -1 },
            { key: 'treatment', weight: 1 },
          ]),
          'the experiment variant control must carry a positive integer weight',
        ],
        [
          'a fractional weight',
          JSON.stringify([
            { key: 'control', weight: 1.5 },
            { key: 'treatment', weight: 1 },
          ]),
          'the experiment variant control must carry a positive integer weight',
        ],
        [
          'a weight written as a string',
          JSON.stringify([
            { key: 'control', weight: '1' },
            { key: 'treatment', weight: 1 },
          ]),
          'the experiment variant control must carry a positive integer weight',
        ],
        [
          'an arm with no weight at all',
          JSON.stringify([{ key: 'control' }, { key: 'treatment', weight: 1 }]),
          'the experiment variant control must carry a positive integer weight',
        ],
      ])('refuses %s', ([_label, variants, message]) =>
        Effect.gen(function* () {
          expect(
            yield* refusalMessage(
              ownerInsert('experiments', experimentRow({ variants })),
            ),
          ).toContain(message);
        }),
      );

      it.effect('accepts the arm shapes the guard exists to admit', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'experiments',
              experimentRow({
                variants: JSON.stringify([
                  { key: 'control', weight: 1 },
                  { key: 'layout.dense-2_b', weight: 7 },
                  { key: 'treatment', weight: 100 },
                ]),
              }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('proves every arm of a redrafted list too', () =>
        Effect.gen(function* () {
          const id = yield* newExperiment();

          expect(
            yield* refusalMessage(
              ownerAffected(
                `UPDATE experiments SET variants = $2 WHERE id = $1`,
                [
                  id,
                  JSON.stringify([
                    { key: 'control', weight: 1 },
                    { key: 'control', weight: 1 },
                  ]),
                ],
              ),
            ),
          ).toContain('the experiment variant key control is used twice');
        }),
      );

      it.effect('freezes the variants once the experiment has started', () =>
        Effect.gen(function* () {
          const id = yield* newExperiment();
          const setVariants = (variants: string) =>
            ownerAffected(
              `UPDATE experiments SET variants = $2 WHERE id = $1`,
              [id, variants],
            );

          // A draft is still being designed.
          expect(yield* setVariants(THREE_VARIANTS)).toBe(1);
          yield* ownerAffected(
            `UPDATE experiments SET state = 'running', started_at = now() WHERE id = $1`,
            [id],
          );
          expect(yield* refusalMessage(setVariants(TWO_VARIANTS))).toContain(
            'the variants of an experiment that has started are immutable',
          );
          // Two BEFORE UPDATE triggers watch this column and fire in name
          // order, so a started experiment is refused as immutable rather
          // than critiqued for the contents of a list it may not carry anyway.
          expect(
            yield* refusalMessage(
              setVariants(JSON.stringify([{ key: 'control', weight: 0 }])),
            ),
          ).toContain(
            'the variants of an experiment that has started are immutable',
          );
          // Everything else about a running experiment still moves.
          expect(
            yield* ownerAffected(
              `UPDATE experiments SET state = 'stopped', stopped_at = now() WHERE id = $1`,
              [id],
            ),
          ).toBe(1);
        }),
      );

      it.effect(
        'never lets a started experiment return to draft or move its start',
        () =>
          Effect.gen(function* () {
            const id = yield* newExperiment();
            yield* ownerAffected(
              `UPDATE experiments SET state = 'running', started_at = now() WHERE id = $1`,
              [id],
            );
            const refused =
              'an experiment that has started cannot return to draft or move its start';

            // Back to draft, start cleared: the walk-back that would let the
            // variants be rewritten under existing assignments.
            expect(
              yield* refusalMessage(
                ownerAffected(
                  `UPDATE experiments SET state = 'draft', started_at = NULL WHERE id = $1`,
                  [id],
                ),
              ),
            ).toContain(refused);
            expect(
              yield* refusalMessage(
                ownerAffected(
                  `UPDATE experiments SET started_at = now() + interval '1 day' WHERE id = $1`,
                  [id],
                ),
              ),
            ).toContain(refused);
            // Stopping is the one transition left.
            expect(
              yield* ownerAffected(
                `UPDATE experiments SET state = 'stopped', stopped_at = now() WHERE id = $1`,
                [id],
              ),
            ).toBe(1);
          }),
      );

      it.effect('keeps one experiment per key per team', () =>
        Effect.gen(function* () {
          const key = `layout_${randomUUID().slice(0, 8)}`;
          yield* newExperiment({ key });

          expect(
            yield* refusalOf(
              ownerInsert('experiments', experimentRow({ key })),
            ),
          ).toMatchObject({
            state: '23505',
            constraint: 'experiments_team_id_key_unique',
          });
          // The key is namespaced by team, so another team may reuse it.
          expect(
            yield* ownerInsert(
              'experiments',
              experimentRow({ key, team_id: TEAM_B }),
            ),
          ).toBe(1);
        }),
      );
    });

    describe('experiment_assignments', () => {
      it.effect.each<
        readonly [label: string, overrides: Row, constraint: string]
      >([
        [
          'an unknown subject kind',
          { subject_kind: 'device' },
          'experiment_assignments_subject_kind_check',
        ],
        [
          'an empty subject id',
          { subject_id: '' },
          'experiment_assignments_lengths_check',
        ],
        [
          'a subject id past 255 characters',
          { subject_id: 's'.repeat(256) },
          'experiment_assignments_lengths_check',
        ],
        [
          'an upper-case variant key',
          { variant_key: 'Control' },
          'experiment_assignments_lengths_check',
        ],
        [
          'a variant key that starts with a digit',
          { variant_key: '1control' },
          'experiment_assignments_lengths_check',
        ],
        [
          'a variant key past 64 characters',
          { variant_key: `a${'b'.repeat(64)}` },
          'experiment_assignments_lengths_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'experiment_assignments',
              assignmentRow(experimentOf[TEAM_A] as string, overrides),
            ),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('allows one assignment per subject per experiment', () =>
        Effect.gen(function* () {
          // This case exercises subject uniqueness, so use one explicit
          // lifetime instead of comparing the host clock with PostgreSQL's
          // default now().
          const startedAt = new Date('2026-01-01T00:00:00Z');
          const experimentId = yield* newExperiment({
            state: 'running',
            started_at: startedAt,
          });
          const subjectId = `user-${randomUUID().slice(0, 8)}`;
          const subject = {
            subject_id: subjectId,
            assigned_at: new Date('2026-01-01T00:00:01Z'),
          };
          yield* newAssignment(experimentId, subject);

          expect(
            yield* refusalOf(
              ownerInsert(
                'experiment_assignments',
                assignmentRow(experimentId, {
                  ...subject,
                  variant_key: 'treatment',
                }),
              ),
            ),
          ).toMatchObject({
            state: '23505',
            constraint:
              'experiment_assignments_experiment_id_subject_kind_subject_id_un',
          });

          // The subject is (kind, id): the same opaque id under another kind
          // is a different subject and may be assigned independently.
          expect(
            yield* ownerInsert(
              'experiment_assignments',
              assignmentRow(experimentId, {
                ...subject,
                subject_kind: 'session',
              }),
            ),
          ).toBe(1);
          // As is the same subject in another experiment.
          const otherId = yield* newExperiment({
            state: 'running',
            started_at: startedAt,
          });
          expect(
            yield* ownerInsert(
              'experiment_assignments',
              assignmentRow(otherId, subject),
            ),
          ).toBe(1);
        }),
      );

      it.effect('refuses a variant the experiment does not define', () =>
        Effect.gen(function* () {
          expect(
            yield* refusalMessage(
              newAssignment(experimentOf[TEAM_A] as string, {
                variant_key: 'placebo',
              }),
            ),
          ).toContain(
            "variant placebo is not one of the experiment's variants",
          );
          expect(
            yield* newAssignment(experimentOf[TEAM_A] as string, {
              variant_key: 'treatment',
            }),
          ).toMatch(/^[0-9a-f-]{36}$/);
        }),
      );

      it.effect('refuses an experiment from another team', () =>
        Effect.gen(function* () {
          expect(
            yield* refusalOf(
              ownerInsert(
                'experiment_assignments',
                assignmentRow(experimentOf[TEAM_B] as string, {
                  team_id: TEAM_A,
                }),
              ),
            ),
          ).toMatchObject({
            state: '23503',
            constraint: 'experiment_assignments_experiment_fk',
            detail: expect.stringContaining(
              'is not present in table "experiments"',
            ),
          });
        }),
      );

      it.effect.each<readonly [label: string, assignment: string]>([
        ['the variant', `variant_key = 'treatment'`],
        ['the subject', `subject_id = 'someone-else'`],
        ['the subject kind', `subject_kind = 'session'`],
        ['the assignment timestamp', `assigned_at = now()`],
      ])('never re-rolls %s', ([_label, assignment]) =>
        Effect.gen(function* () {
          const id = yield* newAssignment(experimentOf[TEAM_A] as string);

          expect(
            yield* refusalMessage(
              ownerAffected(
                `UPDATE experiment_assignments SET ${assignment} WHERE id = $1`,
                [id],
              ),
            ),
          ).toContain('experiment assignments are immutable');
        }),
      );

      it.effect('leaves the erasure delete path open', () =>
        Effect.gen(function* () {
          const participantId = randomUUID();
          const id = yield* newParticipantAssignment(participantId);

          // Immutability stops at UPDATE on purpose: participant erasure has
          // to be able to remove a subject's assignment outright. It presents
          // the marker to say so, and the marker names this assignment's own
          // subject.
          expect(
            yield* erasing(
              TEAM_A,
              participantId,
              `DELETE FROM experiment_assignments WHERE id = $1`,
              [id],
            ),
          ).toBe(1);
        }),
      );

      it.effect('lets the maintenance purge delete without a marker', () =>
        Effect.gen(function* () {
          const id = yield* newAssignment(experimentOf[TEAM_A] as string);

          expect(
            yield* maintenanceAffected(
              `DELETE FROM experiment_assignments WHERE id = $1`,
              [id],
            ),
          ).toBe(1);
        }),
      );

      it.effect(
        'refuses an unmarked delete, so a variant cannot be re-rolled',
        () =>
          Effect.gen(function* () {
            const subjectId = `user-${randomUUID().slice(0, 8)}`;
            const id = yield* newAssignment(experimentOf[TEAM_A] as string, {
              subject_id: subjectId,
            });

            // Without this, deleting and reinserting is a way round the
            // sticky assignment the unique key and the immutability trigger
            // exist to keep.
            expect(
              yield* refusalMessage(
                ownerAffected(
                  `DELETE FROM experiment_assignments WHERE id = $1`,
                  [id],
                ),
              ),
            ).toContain(
              'experiment assignments are deleted only by an audited erasure or the maintenance purge',
            );
            const survivor = yield* ownerRows<{ variant_key: string }>(
              `SELECT variant_key FROM experiment_assignments WHERE id = $1`,
              [id],
            );
            expect(survivor).toEqual([{ variant_key: 'control' }]);
          }),
      );

      it.effect('proves the marker against the assignment it deletes', () =>
        Effect.gen(function* () {
          const participantId = randomUUID();
          const target = yield* newParticipantAssignment(participantId);
          const bystander = yield* newParticipantAssignment(randomUUID());

          expect(
            yield* refusalMessage(
              erasing(
                TEAM_A,
                participantId,
                `DELETE FROM experiment_assignments WHERE id = ANY($1::uuid[])`,
                [[target, bystander]],
              ),
            ),
          ).toContain(
            'experiment assignments are deleted only by an audited erasure or the maintenance purge',
          );
        }),
      );

      it.effect('refuses a marker that names a subject of another kind', () =>
        Effect.gen(function* () {
          // A researcher's assignment belongs to no participant, so no
          // erasure may reach it however the marker is spelled.
          const subjectId = randomUUID();
          const id = yield* newAssignment(experimentOf[TEAM_A] as string, {
            subject_kind: 'user',
            subject_id: subjectId,
          });

          expect(
            yield* refusalMessage(
              erasing(
                TEAM_A,
                subjectId,
                `DELETE FROM experiment_assignments WHERE id = $1`,
                [id],
              ),
            ),
          ).toContain(
            'experiment assignments are deleted only by an audited erasure or the maintenance purge',
          );
        }),
      );
    });

    describe('experiments_stop_closes_lifetime', () => {
      it.effect('refuses a stop before the start', () =>
        Effect.gen(function* () {
          const experimentId = yield* newExperiment({
            state: 'running',
            started_at: new Date('2026-03-01T00:00:00Z'),
          });
          expect(
            (yield* refusalOf(
              ownerAffected(
                `UPDATE experiments SET state = 'stopped', stopped_at = $2 WHERE id = $1`,
                [experimentId, new Date('2026-02-28T00:00:00Z')],
              ),
            )).constraint,
          ).toBe('experiments_state_check');
        }),
      );

      it.effect(
        'refuses a stop that would leave observations outside the lifetime',
        () =>
          Effect.gen(function* () {
            const experimentId = yield* newExperiment({
              state: 'running',
              started_at: new Date('2026-03-01T00:00:00Z'),
            });
            const assignmentId = yield* newAssignment(experimentId, {
              assigned_at: new Date('2026-03-05T00:00:00Z'),
            });
            yield* newExposure(experimentId, assignmentId, {
              occurred_at: new Date('2026-03-20T00:00:00Z'),
            });
            const stop = (at: string) =>
              ownerAffected(
                `UPDATE experiments SET state = 'stopped', stopped_at = $2 WHERE id = $1`,
                [experimentId, new Date(at)],
              );
            expect(
              yield* refusalMessage(stop('2026-03-10T00:00:00Z')),
            ).toContain(
              'an experiment cannot stop before its assignments and exposures',
            );
            expect(
              yield* refusalMessage(stop('2026-03-03T00:00:00Z')),
            ).toContain(
              'an experiment cannot stop before its assignments and exposures',
            );
            expect(yield* stop('2026-03-20T00:00:00Z')).toBe(1);
          }),
      );

      it.effect('holds the stop final once recorded', () =>
        Effect.gen(function* () {
          const experimentId = yield* newExperiment({
            state: 'stopped',
            started_at: new Date('2026-03-01T00:00:00Z'),
            stopped_at: new Date('2026-04-01T00:00:00Z'),
          });
          expect(
            yield* refusalMessage(
              ownerAffected(
                `UPDATE experiments SET stopped_at = $2 WHERE id = $1`,
                [experimentId, new Date('2026-05-01T00:00:00Z')],
              ),
            ),
          ).toContain(
            'an experiment that has stopped cannot resume or move its stop',
          );
          expect(
            yield* refusalMessage(
              ownerAffected(
                `UPDATE experiments SET state = 'running', stopped_at = NULL WHERE id = $1`,
                [experimentId],
              ),
            ),
          ).toContain(
            'an experiment that has stopped cannot resume or move its stop',
          );
        }),
      );
    });

    describe('experiment_rows_within_lifetime', () => {
      it.effect(
        'refuses an assignment or exposure on an experiment that has not started',
        () =>
          Effect.gen(function* () {
            const draftId = yield* newExperiment();
            expect(yield* refusalMessage(newAssignment(draftId))).toContain(
              'an experiment that has not started has no assignments',
            );
          }),
      );

      it.effect(
        'refuses an assignment or exposure dated outside the lifetime',
        () =>
          Effect.gen(function* () {
            const startedAt = new Date('2026-03-01T00:00:00Z');
            const stoppedAt = new Date('2026-04-01T00:00:00Z');
            const experimentId = yield* newExperiment({
              state: 'stopped',
              started_at: startedAt,
              stopped_at: stoppedAt,
            });
            expect(
              yield* refusalMessage(
                newAssignment(experimentId, {
                  assigned_at: new Date('2026-02-28T23:59:59Z'),
                }),
              ),
            ).toContain("an experiment's assignments lie within its lifetime");
            const assignmentId = yield* newAssignment(experimentId, {
              assigned_at: new Date('2026-03-10T00:00:00Z'),
            });
            expect(
              yield* refusalMessage(
                newExposure(experimentId, assignmentId, {
                  occurred_at: new Date('2026-04-01T00:00:01Z'),
                }),
              ),
            ).toContain("an experiment's exposures lie within its lifetime");
            expect(
              yield* refusalMessage(
                newExposure(experimentId, assignmentId, {
                  occurred_at: new Date('2026-02-28T00:00:00Z'),
                }),
              ),
            ).toContain("an experiment's exposures lie within its lifetime");
            // Inside the span, both ends inclusive.
            expect(
              yield* newExposure(experimentId, assignmentId, {
                occurred_at: stoppedAt,
              }),
            ).toMatch(/^[0-9a-f-]{36}$/);
          }),
      );
    });

    describe('experiment_exposures', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const id = yield* newExposure(
            experimentOf[TEAM_A] as string,
            assignmentOf[TEAM_A] as string,
          );

          const rows = yield* ownerRows<{
            details: unknown;
            occurred_at: unknown;
          }>(
            `SELECT details, occurred_at FROM experiment_exposures WHERE id = $1`,
            [id],
          );
          expect(rows[0]?.details).toEqual({});
          // The driver decodes a raw timestamptz as epoch milliseconds.
          expect(rows[0]?.occurred_at).toEqual(expect.any(Number));
        }),
      );

      it.effect.each<
        readonly [label: string, overrides: Row, constraint: string]
      >([
        [
          'scalar details',
          { details: JSON.stringify(3) },
          'experiment_exposures_details_check',
        ],
        [
          'details past two kibibytes',
          { details: JSON.stringify({ blob: 'x'.repeat(4000) }) },
          'experiment_exposures_details_check',
        ],
        [
          'an empty surface key',
          { surface_key: '' },
          'experiment_exposures_lengths_check',
        ],
        [
          'a surface key past 128 characters',
          { surface_key: 's'.repeat(129) },
          'experiment_exposures_lengths_check',
        ],
        [
          'an upper-case variant key',
          { variant_key: 'Control' },
          'experiment_exposures_lengths_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert(
              'experiment_exposures',
              exposureRow(
                experimentOf[TEAM_A] as string,
                assignmentOf[TEAM_A] as string,
                overrides,
              ),
            ),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect(
        'binds an exposure to its assignment’s experiment and arm',
        () =>
          Effect.gen(function* () {
            const experimentId = experimentOf[TEAM_A] as string;
            const assignmentId = assignmentOf[TEAM_A] as string;
            const otherExperimentId = yield* newExperiment();

            // The assignment is `control` on `experimentId`. Filed under another
            // experiment of the same team, or under another arm, the exposure
            // would be counted where its subject was never assigned.
            expect(
              yield* refusalOf(newExposure(otherExperimentId, assignmentId)),
            ).toMatchObject({
              state: '23503',
              constraint: 'experiment_exposures_assignment_fk',
            });
            expect(
              yield* refusalOf(
                newExposure(experimentId, assignmentId, {
                  variant_key: 'treatment',
                }),
              ),
            ).toMatchObject({
              state: '23503',
              constraint: 'experiment_exposures_assignment_fk',
            });
            expect(yield* newExposure(experimentId, assignmentId)).toMatch(
              /^[0-9a-f-]{36}$/,
            );
          }),
      );

      it.effect('refuses an assignment from another team', () =>
        Effect.gen(function* () {
          expect(
            yield* refusalOf(
              ownerInsert(
                'experiment_exposures',
                exposureRow(
                  experimentOf[TEAM_A] as string,
                  assignmentOf[TEAM_B] as string,
                  { team_id: TEAM_A },
                ),
              ),
            ),
          ).toMatchObject({
            state: '23503',
            constraint: 'experiment_exposures_assignment_fk',
            detail: expect.stringContaining(
              'is not present in table "experiment_assignments"',
            ),
          });
        }),
      );

      it.effect.each<readonly [label: string, assignment: string]>([
        ['the variant', `variant_key = 'treatment'`],
        ['the surface', `surface_key = 'sociogram.other'`],
        ['the details', `details = '{"tampered":true}'::jsonb`],
        ['the timestamp', `occurred_at = now()`],
      ])('never rewrites %s of a logged exposure', ([_label, assignment]) =>
        Effect.gen(function* () {
          const id = yield* newExposure(
            experimentOf[TEAM_A] as string,
            assignmentOf[TEAM_A] as string,
          );

          // The exposure trigger reuses the assignment guard's function, so
          // it raises the assignment message.
          expect(
            yield* refusalMessage(
              ownerAffected(
                `UPDATE experiment_exposures SET ${assignment} WHERE id = $1`,
                [id],
              ),
            ),
          ).toContain('experiment assignments are immutable');
        }),
      );

      it.effect('leaves the erasure delete path open', () =>
        Effect.gen(function* () {
          const participantId = randomUUID();
          const assignmentId = yield* newParticipantAssignment(participantId);
          yield* newExposure(experimentOf[TEAM_A] as string, assignmentId);

          // An exposure carries no subject of its own, so the marker is proven
          // through the assignment it was logged against — and the exposures
          // must go first, because the composite key holds the assignment in
          // place while any of them survive.
          expect(
            yield* erasing(
              TEAM_A,
              participantId,
              `DELETE FROM experiment_exposures WHERE assignment_id = $1`,
              [assignmentId],
            ),
          ).toBe(1);
        }),
      );

      it.effect(
        'refuses an unmarked delete, so an arm cannot be re-rolled',
        () =>
          Effect.gen(function* () {
            const id = yield* newExposure(
              experimentOf[TEAM_A] as string,
              assignmentOf[TEAM_A] as string,
            );

            // Deleting the exposures is the first half of re-rolling an
            // assignment: the composite key only holds the assignment while
            // they exist.
            expect(
              yield* refusalMessage(
                ownerAffected(
                  `DELETE FROM experiment_exposures WHERE id = $1`,
                  [id],
                ),
              ),
            ).toContain(
              'experiment exposures are deleted only by an audited erasure or the maintenance purge',
            );
          }),
      );

      it.effect('lets the maintenance purge delete without a marker', () =>
        Effect.gen(function* () {
          const id = yield* newExposure(
            experimentOf[TEAM_A] as string,
            assignmentOf[TEAM_A] as string,
          );

          expect(
            yield* maintenanceAffected(
              `DELETE FROM experiment_exposures WHERE id = $1`,
              [id],
            ),
          ).toBe(1);
        }),
      );

      it.effect("proves the marker against the exposure's own assignment", () =>
        Effect.gen(function* () {
          const participantId = randomUUID();
          const assignmentId = yield* newParticipantAssignment(participantId);
          const theirs = yield* newParticipantAssignment(randomUUID());
          const id = yield* newExposure(experimentOf[TEAM_A] as string, theirs);

          expect(
            yield* refusalMessage(
              erasing(
                TEAM_A,
                participantId,
                `DELETE FROM experiment_exposures WHERE id = $1`,
                [id],
              ),
            ),
          ).toContain(
            'experiment exposures are deleted only by an audited erasure or the maintenance purge',
          );
          // ...and the same marker reaches its own participant's exposures.
          yield* newExposure(experimentOf[TEAM_A] as string, assignmentId);
          expect(
            yield* erasing(
              TEAM_A,
              participantId,
              `DELETE FROM experiment_exposures WHERE assignment_id = $1`,
              [assignmentId],
            ),
          ).toBe(1);
        }),
      );
    });

    it.effect('shows a team only its own experiments', () =>
      Effect.gen(function* () {
        const visible = yield* tenantRows(
          TEAM_A,
          `SELECT DISTINCT team_id FROM experiments`,
        );
        expect(visible).toEqual([{ team_id: TEAM_A }]);

        const refused = yield* refusalOf(
          tenantRows(
            TEAM_A,
            `INSERT INTO experiments (id, team_id, key, name, surface, variants)
             VALUES ($1, $2, $3, 'Cross-tenant', 'researcher', $4::jsonb)`,
            [
              randomUUID(),
              TEAM_B,
              `layout_${randomUUID().slice(0, 8)}`,
              TWO_VARIANTS,
            ],
          ),
        );
        expect(refused.state).toBe('42501');
      }),
    );
  });
});
