// The study-role tier's database-enforced promises: one live grant per user
// per study, the four roles #1257 names, the composite foreign key that keeps a
// grant's study inside its own team, and the row-level security that stops one
// team granting itself a role over another team's study.
//
// The table carries no sidecar trigger by design: a grant is current state, not
// evidence — changing a role is an UPDATE, removing someone is a DELETE, and
// the audit log is the history. The last case pins that, so a trigger added
// later has to update it rather than silently subsume it.
import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import {
  ownerAffected,
  ownerRows,
  refusalOf,
  TestDatabase,
  TestDatabaseLive,
  testDb,
  ownerInsert,
  tenantRows,
} from '../../__tests__/support/database.ts';

const TEAMS = ['team-a', 'team-b'] as const;
type Team = (typeof TEAMS)[number];
const TEAM_A: Team = 'team-a';
const TEAM_B: Team = 'team-b';

type Row = Record<string, unknown>;

/**
 * One rejection case: the label the test title reads, the row override that
 * provokes the rejection, and the constraint Postgres must name.
 *
 * A tuple rather than an object because the title is interpolated with `%s`,
 * which prints the label whole — a `$property` substitution is truncated at
 * forty characters.
 */
type CheckCase = readonly [label: string, overrides: Row, constraint: string];

const newStudy = Effect.fnUntraced(function* (teamId: string = TEAM_A) {
  const id = randomUUID();
  yield* ownerInsert('studies', { id, team_id: teamId, name: 'A study' });
  return id;
});

const grantRow = (studyId: string, overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  study_id: studyId,
  user_id: `user-${randomUUID().slice(0, 8)}`,
  role: 'manager',
  granted_by_user_id: 'user-admin',
  ...overrides,
});

/** One study per team, named up front so the fixtures can reach both. */
const studyOf: Record<Team, string> = {
  'team-a': randomUUID(),
  'team-b': randomUUID(),
};

/**
 * The suite's `beforeAll`, as a layer: it runs once when the scratch schema is
 * built, which is what the node-postgres suite's `beforeAll` did.
 */
const seed = Effect.flatMap(TestDatabase, (harness) =>
  harness.onOwner(
    Effect.forEach(TEAMS, (teamId) =>
      Effect.gen(function* () {
        yield* harness.owner.sql`INSERT INTO teams (id, name, slug)
                                 VALUES (${teamId}, ${teamId}, ${teamId})
                                 ON CONFLICT (id) DO NOTHING`;
        yield* harness.owner.sql`INSERT INTO studies (id, team_id, name)
                                 VALUES (${studyOf[teamId]}, ${teamId}, 'A study')`;
      }),
    ),
  ),
);

const SeededDatabaseLive = Layer.effectDiscard(seed).pipe(
  Layer.provideMerge(TestDatabaseLive),
);

describe.skipIf(!testDb)('study role grants schema', () => {
  layer(SeededDatabaseLive, { excludeTestServices: true })(
    'over a scratch schema',
    (it) => {
      it.effect(
        'masks contact details until PII access is granted explicitly',
        () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const row = grantRow(studyId);
            yield* ownerInsert('study_role_grants', row);

            const stored = yield* ownerRows<{ pii_access: boolean }>(
              `SELECT pii_access FROM study_role_grants WHERE id = $1`,
              [row.id],
            );
            // The flag is orthogonal to the role and defaults closed: a Manager
            // has no contact details until someone grants them separately.
            expect(stored[0]).toEqual({ pii_access: false });
          }),
      );

      it.effect.each([
        'manager',
        'protocol_designer',
        'coordinator',
        'data_viewer',
      ])('admits the %s role', (role) =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          expect(
            yield* ownerInsert(
              'study_role_grants',
              grantRow(studyId, { role }),
            ),
          ).toBe(1);
        }),
      );

      it.effect.each<CheckCase>([
        ['an unknown role', { role: 'owner' }, 'study_role_grants_role_check'],
        [
          'a team role borrowed from team_members',
          { role: 'admin' },
          'study_role_grants_role_check',
        ],
        [
          'an empty user',
          { user_id: '' },
          'study_role_grants_identifier_lengths_check',
        ],
        [
          'a user past 255 characters',
          { user_id: 'u'.repeat(256) },
          'study_role_grants_identifier_lengths_check',
        ],
        [
          'an empty granting user',
          { granted_by_user_id: '' },
          'study_role_grants_identifier_lengths_check',
        ],
        [
          'a granting user past 255 characters',
          { granted_by_user_id: 'u'.repeat(256) },
          'study_role_grants_identifier_lengths_check',
        ],
      ])('rejects %s', ([, overrides, constraint]) =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          expect(
            (yield* refusalOf(
              ownerInsert('study_role_grants', grantRow(studyId, overrides)),
            )).constraint,
          ).toBe(constraint);
        }),
      );

      it.effect('holds one live grant per user per study', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy();
          const otherStudyId = yield* newStudy();
          const userId = 'user-researcher';
          yield* ownerInsert(
            'study_role_grants',
            grantRow(studyId, { user_id: userId }),
          );

          expect(
            (yield* refusalOf(
              ownerInsert(
                'study_role_grants',
                grantRow(studyId, { user_id: userId, role: 'coordinator' }),
              ),
            )).constraint,
          ).toBe('study_role_grants_study_id_user_id_unique');

          // The same person may hold a different role on a different study.
          expect(
            yield* ownerInsert(
              'study_role_grants',
              grantRow(otherStudyId, { user_id: userId, role: 'data_viewer' }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('refuses a grant whose team disagrees with its study', () =>
        Effect.gen(function* () {
          const studyId = yield* newStudy(TEAM_A);
          expect(
            yield* refusalOf(
              ownerInsert(
                'study_role_grants',
                grantRow(studyId, { team_id: TEAM_B }),
              ),
            ),
          ).toMatchObject({
            state: '23503',
            constraint: 'study_role_grants_study_fk',
          });
        }),
      );

      it.effect('refuses a grant over a study that does not exist', () =>
        Effect.gen(function* () {
          expect(
            yield* refusalOf(
              ownerInsert('study_role_grants', grantRow(randomUUID())),
            ),
          ).toMatchObject({
            state: '23503',
            constraint: 'study_role_grants_study_fk',
          });
        }),
      );

      it.effect('stops one team granting itself a role over another team', () =>
        Effect.gen(function* () {
          // Writing a row carrying the other team's id is refused by the
          // policy...
          expect(
            (yield* refusalOf(
              tenantRows(
                TEAM_A,
                `INSERT INTO study_role_grants
                   (id, team_id, study_id, user_id, role, granted_by_user_id)
                 VALUES ($1, $2, $3, 'user-intruder', 'manager', 'user-admin')`,
                [randomUUID(), TEAM_B, studyOf[TEAM_B]],
              ),
            )).state,
          ).toBe('42501');

          // ...and claiming the other team's study under this team's id is
          // refused by the composite foreign key, so neither half of the pair
          // is a way in.
          expect(
            yield* refusalOf(
              tenantRows(
                TEAM_A,
                `INSERT INTO study_role_grants
                   (id, team_id, study_id, user_id, role, granted_by_user_id)
                 VALUES ($1, $2, $3, 'user-intruder', 'manager', 'user-admin')`,
                [randomUUID(), TEAM_A, studyOf[TEAM_B]],
              ),
            ),
          ).toMatchObject({
            state: '23503',
            constraint: 'study_role_grants_study_fk',
          });

          const leaked = yield* ownerRows<{ n: number }>(
            `SELECT count(*)::int AS n FROM study_role_grants WHERE team_id = $1`,
            [TEAM_B],
          );
          expect(leaked[0]).toEqual({ n: 0 });
        }),
      );

      it.effect('shows a team only its own grants', () =>
        Effect.gen(function* () {
          const grantId = randomUUID();
          yield* ownerInsert('study_role_grants', {
            id: grantId,
            team_id: TEAM_B,
            study_id: studyOf[TEAM_B],
            user_id: 'user-elsewhere',
            role: 'manager',
            granted_by_user_id: 'user-admin',
          });

          const visible = yield* tenantRows<{ id: string }>(
            TEAM_A,
            `SELECT id FROM study_role_grants WHERE id = $1`,
            [grantId],
          );
          expect([...visible]).toEqual([]);

          // The positive control: the login that no policy binds does see it.
          const login = yield* ownerRows<{ id: string }>(
            `SELECT id FROM study_role_grants WHERE id = $1`,
            [grantId],
          );
          expect([...login]).toEqual([{ id: grantId }]);
        }),
      );

      it.effect(
        'keeps a grant mutable and removable: the audit log is the history',
        () =>
          Effect.gen(function* () {
            const studyId = yield* newStudy();
            const row = grantRow(studyId);
            yield* ownerInsert('study_role_grants', row);

            // Changing someone's role is an UPDATE, and PII access is granted
            // on top of an existing role rather than by reissuing the grant.
            expect(
              yield* ownerAffected(
                `UPDATE study_role_grants
                 SET role = 'coordinator', pii_access = true, updated_at = now()
                 WHERE id = $1`,
                [row.id],
              ),
            ).toBe(1);
            // Removing them is a DELETE: there is no revocation tombstone.
            expect(
              yield* ownerAffected(
                `DELETE FROM study_role_grants WHERE id = $1`,
                [row.id],
              ),
            ).toBe(1);
          }),
      );
    },
  );
});
