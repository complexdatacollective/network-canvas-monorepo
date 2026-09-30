// The feedback module's database-enforced promises: the consent gate that
// makes stored context structural rather than a form-layer promise, the
// reporter/kind/triage-state checks, and the composite foreign key that keeps
// a report and the study it names inside one team.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK or foreign-key violation — so a guard that stopped firing
// cannot pass as "no error".
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
  ownerInsert,
  tenantRows,
} from '../../__tests__/support/database.ts';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

const CONTEXT = JSON.stringify({
  route: '/studies/1/monitor',
  stageId: 'stage-3',
  appVersion: '0.2.0',
});

/** One study per team, for the optional study reference. */
const studyOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};

const reportRow = (overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  reporter_kind: 'anonymous',
  kind: 'bug',
  body: 'The sociogram froze after the third prompt.',
  ...overrides,
});

const newReport = (overrides: Row = {}) => {
  const row = reportRow(overrides);
  return Effect.as(ownerInsert('feedback_reports', row), row.id as string);
};

/** Both teams and a study each, once for the file. */
const Fixtures = Layer.effectDiscard(
  Effect.forEach([TEAM_A, TEAM_B], (teamId) =>
    Effect.andThen(
      insertTeam(teamId),
      ownerInsert('studies', {
        id: studyOf[teamId],
        team_id: teamId,
        name: `${teamId} study`,
      }),
    ),
  ),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('feedback schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    it.effect('applies the documented defaults', () =>
      Effect.gen(function* () {
        const id = yield* newReport();

        const rows = yield* ownerRows(
          `SELECT study_id, reporter_user_id, context, context_consent, state,
                  external_ref, triaged_at
           FROM feedback_reports WHERE id = $1`,
          [id],
        );
        expect(rows[0]).toEqual({
          study_id: null,
          reporter_user_id: null,
          context: {},
          context_consent: false,
          state: 'new',
          external_ref: null,
          triaged_at: null,
        });
      }),
    );

    describe('the context consent gate', () => {
      it.effect(
        'refuses to store context the reporter did not agree to send',
        () =>
          Effect.gen(function* () {
            const refused = yield* refusalOf(
              ownerInsert(
                'feedback_reports',
                reportRow({ context: CONTEXT, context_consent: false }),
              ),
            );
            expect(refused.constraint).toBe(
              'feedback_reports_context_consent_check',
            );
          }),
      );

      it.effect('stores context once the box is checked', () =>
        Effect.gen(function* () {
          const id = yield* newReport({
            context: CONTEXT,
            context_consent: true,
          });

          const rows = yield* ownerRows<{ context: Row }>(
            `SELECT context FROM feedback_reports WHERE id = $1`,
            [id],
          );
          expect(rows[0]?.context).toMatchObject({
            route: '/studies/1/monitor',
            stageId: 'stage-3',
          });
        }),
      );

      it.effect('admits a consent-less report that carries no context', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'feedback_reports',
              reportRow({ context: '{}', context_consent: false }),
            ),
          ).toBe(1);
        }),
      );

      it.effect(
        'refuses to withdraw consent while the context is still stored',
        () =>
          Effect.gen(function* () {
            const id = yield* newReport({
              context: CONTEXT,
              context_consent: true,
            });

            const refused = yield* refusalOf(
              ownerAffected(
                `UPDATE feedback_reports SET context_consent = false WHERE id = $1`,
                [id],
              ),
            );
            expect(refused.constraint).toBe(
              'feedback_reports_context_consent_check',
            );

            // Withdrawal is only ever consent plus erasure, in one statement.
            expect(
              yield* ownerAffected(
                `UPDATE feedback_reports
               SET context_consent = false, context = '{}'::jsonb
               WHERE id = $1`,
                [id],
              ),
            ).toBe(1);
          }),
      );
    });

    it.effect.each<
      readonly [label: string, overrides: Row, constraint: string]
    >([
      [
        'an unknown reporter kind',
        { reporter_kind: 'bot' },
        'feedback_reports_reporter_kind_check',
      ],
      [
        'a user report with no user id',
        { reporter_kind: 'user' },
        'feedback_reports_reporter_kind_check',
      ],
      [
        'a user id on an anonymous report',
        { reporter_user_id: 'user-1' },
        'feedback_reports_reporter_kind_check',
      ],
      [
        'a user id on a participant report',
        { reporter_kind: 'participant', reporter_user_id: 'user-1' },
        'feedback_reports_reporter_kind_check',
      ],
      ['an unknown kind', { kind: 'praise' }, 'feedback_reports_kind_check'],
      [
        'an unknown state',
        { state: 'wontfix' },
        'feedback_reports_state_check',
      ],
      [
        'a new report that is already triaged',
        { triaged_at: new Date() },
        'feedback_reports_state_check',
      ],
      [
        'a triaged report with no triage timestamp',
        { state: 'triaged' },
        'feedback_reports_state_check',
      ],
      [
        'a scalar context',
        { context: JSON.stringify('everything'), context_consent: true },
        'feedback_reports_context_object_check',
      ],
      [
        'a context past four kibibytes',
        {
          context: JSON.stringify({ blob: 'x'.repeat(8000) }),
          context_consent: true,
        },
        'feedback_reports_context_object_check',
      ],
      ['an empty body', { body: '' }, 'feedback_reports_lengths_check'],
      ['a blank body', { body: '   ' }, 'feedback_reports_lengths_check'],
      [
        'a body past 5000 characters',
        { body: 'b'.repeat(5001) },
        'feedback_reports_lengths_check',
      ],
      [
        'an empty external reference',
        { external_ref: '' },
        'feedback_reports_lengths_check',
      ],
      [
        'an external reference past 500 characters',
        { external_ref: 'r'.repeat(501) },
        'feedback_reports_lengths_check',
      ],
      [
        'a reporter id past 255 characters',
        { reporter_kind: 'user', reporter_user_id: 'u'.repeat(256) },
        'feedback_reports_lengths_check',
      ],
    ])('rejects %s', ([_label, overrides, constraint]) =>
      Effect.gen(function* () {
        const refused = yield* refusalOf(
          ownerInsert('feedback_reports', reportRow(overrides)),
        );
        expect(refused.constraint).toBe(constraint);
      }),
    );

    it.effect('accepts the shapes the checks exist to admit', () =>
      Effect.gen(function* () {
        expect(
          yield* ownerInsert(
            'feedback_reports',
            reportRow({ reporter_kind: 'user', reporter_user_id: 'user-1' }),
          ),
        ).toBe(1);
        expect(
          yield* ownerInsert(
            'feedback_reports',
            reportRow({ reporter_kind: 'participant' }),
          ),
        ).toBe(1);
        expect(
          yield* ownerInsert(
            'feedback_reports',
            reportRow({ kind: 'suggestion' }),
          ),
        ).toBe(1);
        for (const state of ['triaged', 'forwarded', 'closed']) {
          expect(
            yield* ownerInsert(
              'feedback_reports',
              reportRow({
                state,
                triaged_at: new Date(),
                external_ref: 'https://github.example/org/repo/issues/1',
              }),
            ),
          ).toBe(1);
        }
      }),
    );

    it.effect('accepts a report against the reporting team’s own study', () =>
      Effect.gen(function* () {
        expect(
          yield* ownerInsert(
            'feedback_reports',
            reportRow({ study_id: studyOf[TEAM_A] }),
          ),
        ).toBe(1);
      }),
    );

    it.effect('refuses a study from another team', () =>
      Effect.gen(function* () {
        const refused = yield* refusalOf(
          ownerInsert(
            'feedback_reports',
            reportRow({ team_id: TEAM_A, study_id: studyOf[TEAM_B] }),
          ),
        );
        expect(refused).toMatchObject({
          state: '23503',
          constraint: 'feedback_reports_study_fk',
          detail: expect.stringContaining('is not present in table "studies"'),
        });
      }),
    );

    it.effect('shows a team only its own reports', () =>
      Effect.gen(function* () {
        yield* ownerInsert('feedback_reports', reportRow({ team_id: TEAM_B }));

        const visible = yield* tenantRows(
          TEAM_A,
          `SELECT DISTINCT team_id FROM feedback_reports`,
        );
        expect(visible).toEqual([{ team_id: TEAM_A }]);

        const refused = yield* refusalOf(
          tenantRows(
            TEAM_A,
            `INSERT INTO feedback_reports (id, team_id, reporter_kind, kind, body)
             VALUES ($1, $2, 'anonymous', 'bug', 'cross-tenant')`,
            [randomUUID(), TEAM_B],
          ),
        );
        expect(refused.state).toBe('42501');
      }),
    );
  });
});
