// The token module's database-enforced promises: the scope/study
// biconditional, the secret and prefix formats, the composite foreign key that
// keeps a token's study inside its own team, and the sidecar trigger that fixes
// a token's authority at issue while leaving custodianship reassignable and
// revocation one-way.
//
// API tokens are team-owned service tokens: there is no owner column and no
// intersection with a user's live RBAC. What a token may do is read from its
// own `scope_kind`, `study_id`, `access_level` and `includes_pii`, which is
// precisely why the trigger below freezes all four.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

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

/** A well-formed sha256 hex digest; the check only ever looks at the shape. */
const hash = () => randomBytes(32).toString('hex');
/** The non-secret display prefix, e.g. `ncs_live_a1b2c3d4`. */
const prefix = () => `ncs_live_${randomBytes(4).toString('hex')}`;

/** One study per team, for the study-scoped tokens. */
const studyOf: Record<string, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};

const newStudy = (teamId = TEAM_A, id: string = randomUUID()) =>
  Effect.as(
    ownerInsert('studies', { id, team_id: teamId, name: 'A study' }),
    id,
  );

const tokenRow = (overrides: Row = {}): Row => ({
  id: randomUUID(),
  team_id: TEAM_A,
  name: 'Export pipeline',
  custodian_user_id: 'user-custodian',
  token_prefix: prefix(),
  token_hash: hash(),
  scope_kind: 'team',
  access_level: 'read',
  created_by_user_id: 'user-admin',
  ...overrides,
});

const newToken = (overrides: Row = {}) => {
  const row = tokenRow(overrides);
  return Effect.as(ownerInsert('api_tokens', row), row.id as string);
};

/** Both teams and a study each, once for the file. */
const Fixtures = Layer.effectDiscard(
  Effect.forEach([TEAM_A, TEAM_B], (teamId) =>
    Effect.andThen(insertTeam(teamId), newStudy(teamId, studyOf[teamId])),
  ),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('api token schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    it.effect('applies the documented defaults', () =>
      Effect.gen(function* () {
        const tokenId = yield* newToken();

        const rows = yield* ownerRows(
          `SELECT includes_pii, study_id, expires_at, last_used_at,
                  revoked_at, revoked_by_user_id
           FROM api_tokens WHERE id = $1`,
          [tokenId],
        );
        expect(rows[0]).toEqual({
          includes_pii: false,
          study_id: null,
          expires_at: null,
          last_used_at: null,
          revoked_at: null,
          revoked_by_user_id: null,
        });
      }),
    );

    it.effect(
      'requires a custodian: a service token always names an accountable human',
      () =>
        Effect.gen(function* () {
          const row = tokenRow();
          delete row.custodian_user_id;
          const refused = yield* refusalOf(ownerInsert('api_tokens', row));
          expect(refused.state).toBe('23502');
          expect(refused.message).toContain('column "custodian_user_id"');
        }),
    );

    it.effect.each<
      readonly [label: string, overrides: Row, constraint: string]
    >([
      [
        'an unknown scope kind',
        { scope_kind: 'organisation' },
        'api_tokens_scope_kind_check',
      ],
      [
        'a team scope carrying a study',
        {
          scope_kind: 'team',
          study_id: '00000000-0000-4000-8000-000000000001',
        },
        'api_tokens_scope_kind_check',
      ],
      [
        'a study scope carrying no study',
        { scope_kind: 'study' },
        'api_tokens_scope_kind_check',
      ],
      [
        'an unknown access level',
        { access_level: 'admin' },
        'api_tokens_access_level_check',
      ],
      [
        'a revocation with no revoking user',
        { revoked_at: new Date() },
        'api_tokens_revocation_check',
      ],
      [
        'a revoking user with no revocation',
        { revoked_by_user_id: 'user-admin' },
        'api_tokens_revocation_check',
      ],
      [
        'a secret that is not sha256 hex',
        { token_hash: 'not-a-digest' },
        'api_tokens_token_hash_check',
      ],
      [
        'a secret hashed in upper case',
        { token_hash: hash().toUpperCase() },
        'api_tokens_token_hash_check',
      ],
      [
        'a prefix under eight characters',
        { token_prefix: 'ncs_liv' },
        'api_tokens_token_prefix_check',
      ],
      [
        'a prefix past forty characters',
        { token_prefix: `ncs_${'a'.repeat(40)}` },
        'api_tokens_token_prefix_check',
      ],
      [
        'a prefix carrying upper case',
        { token_prefix: 'NCS_LIVE_A1B2' },
        'api_tokens_token_prefix_check',
      ],
      ['a blank name', { name: ' \t ' }, 'api_tokens_name_check'],
      [
        'a name past 120 characters',
        { name: 'x'.repeat(121) },
        'api_tokens_name_check',
      ],
      [
        'an empty custodian',
        { custodian_user_id: '' },
        'api_tokens_actor_lengths_check',
      ],
      [
        'a custodian past 255 characters',
        { custodian_user_id: 'u'.repeat(256) },
        'api_tokens_actor_lengths_check',
      ],
      [
        'an empty creating user',
        { created_by_user_id: '' },
        'api_tokens_actor_lengths_check',
      ],
      [
        'a revoking user past 255 characters',
        { revoked_at: new Date(), revoked_by_user_id: 'u'.repeat(256) },
        'api_tokens_actor_lengths_check',
      ],
    ])('rejects %s', ([_label, overrides, constraint]) =>
      Effect.gen(function* () {
        const refused = yield* refusalOf(
          ownerInsert('api_tokens', tokenRow(overrides)),
        );
        expect(refused.constraint).toBe(constraint);
      }),
    );

    it.effect('accepts the scopes the biconditional exists to admit', () =>
      Effect.gen(function* () {
        expect(
          yield* ownerInsert('api_tokens', tokenRow({ scope_kind: 'team' })),
        ).toBe(1);
        expect(
          yield* ownerInsert(
            'api_tokens',
            tokenRow({ scope_kind: 'study', study_id: studyOf[TEAM_A] }),
          ),
        ).toBe(1);
        expect(
          yield* ownerInsert(
            'api_tokens',
            tokenRow({ access_level: 'write', includes_pii: true }),
          ),
        ).toBe(1);
      }),
    );

    it.effect('refuses a study scope pointing at another team', () =>
      Effect.gen(function* () {
        const refused = yield* refusalOf(
          ownerInsert(
            'api_tokens',
            tokenRow({
              team_id: TEAM_A,
              scope_kind: 'study',
              study_id: studyOf[TEAM_B],
            }),
          ),
        );
        expect(refused).toMatchObject({
          state: '23503',
          constraint: 'api_tokens_study_fk',
        });
      }),
    );

    it.effect('makes the secret and its prefix single-row lookups', () =>
      Effect.gen(function* () {
        const sharedHash = hash();
        const sharedPrefix = prefix();
        yield* newToken({ token_hash: sharedHash, token_prefix: sharedPrefix });

        expect(
          (yield* refusalOf(
            ownerInsert('api_tokens', tokenRow({ token_hash: sharedHash })),
          )).constraint,
        ).toBe('api_tokens_token_hash_idx');
        expect(
          (yield* refusalOf(
            ownerInsert('api_tokens', tokenRow({ token_prefix: sharedPrefix })),
          )).constraint,
        ).toBe('api_tokens_token_prefix_idx');
      }),
    );

    it.effect('holds every column of a token authority immutable', () =>
      Effect.gen(function* () {
        // A study-scoped token, so `study_id` can be moved to another valid
        // study in the same team: the trigger, not the scope check or the
        // foreign key, must be what refuses it.
        const tokenId = yield* newToken({
          scope_kind: 'study',
          study_id: studyOf[TEAM_A],
        });
        const siblingStudyId = yield* newStudy(TEAM_A);

        for (const assignment of [
          `id = '${randomUUID()}'`,
          `team_id = '${TEAM_B}'`,
          `token_prefix = '${prefix()}'`,
          `token_hash = '${hash()}'`,
          `scope_kind = 'team', study_id = NULL`,
          `study_id = '${siblingStudyId}'`,
          `access_level = 'write'`,
          `includes_pii = true`,
          `expires_at = now()`,
          `created_by_user_id = 'user-someone-else'`,
          `created_at = now()`,
        ]) {
          const refused = yield* refusalOf(
            ownerAffected(`UPDATE api_tokens SET ${assignment} WHERE id = $1`, [
              tokenId,
            ]),
          );
          expect(refused.message).toContain('api token authority is immutable');
        }
      }),
    );

    it.effect('permits custodian reassignment and usage evidence', () =>
      Effect.gen(function* () {
        const tokenId = yield* newToken();

        // Reassigning the custodian when a researcher leaves is the whole
        // point of the column, so it sits deliberately outside the immutable
        // set.
        expect(
          yield* ownerAffected(
            `UPDATE api_tokens SET custodian_user_id = 'user-successor'
             WHERE id = $1`,
            [tokenId],
          ),
        ).toBe(1);
        expect(
          yield* ownerAffected(
            `UPDATE api_tokens SET name = 'Nightly export', last_used_at = now()
             WHERE id = $1`,
            [tokenId],
          ),
        ).toBe(1);

        const rows = yield* ownerRows(
          `SELECT custodian_user_id, name FROM api_tokens WHERE id = $1`,
          [tokenId],
        );
        expect(rows[0]).toEqual({
          custodian_user_id: 'user-successor',
          name: 'Nightly export',
        });
      }),
    );

    it.effect('makes revocation one-way', () =>
      Effect.gen(function* () {
        const tokenId = yield* newToken();

        // Revoking once is the write the trigger exists to admit.
        expect(
          yield* ownerAffected(
            `UPDATE api_tokens
             SET revoked_at = $2, revoked_by_user_id = 'user-admin' WHERE id = $1`,
            [tokenId, new Date('2026-04-01T09:00:00Z')],
          ),
        ).toBe(1);

        for (const assignment of [
          `revoked_at = now()`,
          `revoked_at = NULL, revoked_by_user_id = NULL`,
          // The accountable name freezes with the timestamp. Left out, it
          // stays rewritable on a revoked token, and
          // api_tokens_revocation_check only keeps the pair non-null — so it
          // could be reassigned to anyone.
          `revoked_by_user_id = 'user-someone-else'`,
        ]) {
          const refused = yield* refusalOf(
            ownerAffected(`UPDATE api_tokens SET ${assignment} WHERE id = $1`, [
              tokenId,
            ]),
          );
          expect(refused.message).toContain('api token authority is immutable');
        }

        const rows = yield* ownerRows(
          `SELECT revoked_by_user_id FROM api_tokens WHERE id = $1`,
          [tokenId],
        );
        expect(rows[0]).toEqual({ revoked_by_user_id: 'user-admin' });
      }),
    );

    it.effect('refuses a token written into another team', () =>
      Effect.gen(function* () {
        const refused = yield* refusalOf(
          tenantRows(
            TEAM_A,
            `INSERT INTO api_tokens
               (id, team_id, name, custodian_user_id, token_prefix, token_hash,
                scope_kind, access_level, created_by_user_id)
             VALUES ($1, $2, 'Smuggled', 'user-custodian', $3, $4, 'team', 'read',
                     'user-admin')`,
            [randomUUID(), TEAM_B, prefix(), hash()],
          ),
        );
        expect(refused.state).toBe('42501');
      }),
    );
  });
});
