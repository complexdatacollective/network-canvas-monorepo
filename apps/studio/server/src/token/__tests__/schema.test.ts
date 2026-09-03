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

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

/** A well-formed sha256 hex digest; the check only ever looks at the shape. */
const hash = () => randomBytes(32).toString('hex');
/** The non-secret display prefix, e.g. `ncs_live_a1b2c3d4`. */
const prefix = () => `ncs_live_${randomBytes(4).toString('hex')}`;

describe.skipIf(!db)('api token schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  const studyOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` pool instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  async function newStudy(teamId = TEAM_A): Promise<string> {
    const id = randomUUID();
    await insert('studies', { id, team_id: teamId, name: 'A study' });
    return id;
  }

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

  async function newToken(overrides: Row = {}): Promise<string> {
    const row = tokenRow(overrides);
    await insert('api_tokens', row);
    return row.id as string;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      studyOf[teamId] = await newStudy(teamId);
    }
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  it('applies the documented defaults', async () => {
    const tokenId = await newToken();

    const row = await pool.query<Row>(
      `SELECT includes_pii, study_id, expires_at, last_used_at,
              revoked_at, revoked_by_user_id
       FROM api_tokens WHERE id = $1`,
      [tokenId],
    );
    expect(row.rows[0]).toEqual({
      includes_pii: false,
      study_id: null,
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
      revoked_by_user_id: null,
    });
  });

  it('requires a custodian: a service token always names an accountable human', async () => {
    const row = tokenRow();
    delete row.custodian_user_id;
    await expect(insert('api_tokens', row)).rejects.toMatchObject({
      code: '23502',
      column: 'custodian_user_id',
    });
  });

  it.each([
    [
      'an unknown scope kind',
      { scope_kind: 'workspace' },
      'api_tokens_scope_kind_check',
    ],
    [
      'a team scope carrying a study',
      { scope_kind: 'team', study_id: '00000000-0000-4000-8000-000000000001' },
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
  ])('rejects %s', async (_label, overrides, constraint) => {
    await expect(
      insert('api_tokens', tokenRow(overrides)),
    ).rejects.toMatchObject({ constraint });
  });

  it('accepts the scopes the biconditional exists to admit', async () => {
    await expect(
      insert('api_tokens', tokenRow({ scope_kind: 'team' })),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      insert(
        'api_tokens',
        tokenRow({ scope_kind: 'study', study_id: studyOf[TEAM_A] }),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      insert(
        'api_tokens',
        tokenRow({ access_level: 'write', includes_pii: true }),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('refuses a study scope pointing at another team', async () => {
    await expect(
      insert(
        'api_tokens',
        tokenRow({
          team_id: TEAM_A,
          scope_kind: 'study',
          study_id: studyOf[TEAM_B],
        }),
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'api_tokens_study_fk',
    });
  });

  it('makes the secret and its prefix single-row lookups', async () => {
    const sharedHash = hash();
    const sharedPrefix = prefix();
    await newToken({ token_hash: sharedHash, token_prefix: sharedPrefix });

    await expect(
      insert('api_tokens', tokenRow({ token_hash: sharedHash })),
    ).rejects.toMatchObject({ constraint: 'api_tokens_token_hash_idx' });
    await expect(
      insert('api_tokens', tokenRow({ token_prefix: sharedPrefix })),
    ).rejects.toMatchObject({ constraint: 'api_tokens_token_prefix_idx' });
  });

  it('holds every column of a token authority immutable', async () => {
    // A study-scoped token, so `study_id` can be moved to another valid study
    // in the same team: the trigger, not the scope check or the foreign key,
    // must be what refuses it.
    const tokenId = await newToken({
      scope_kind: 'study',
      study_id: studyOf[TEAM_A],
    });
    const siblingStudyId = await newStudy(TEAM_A);

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
      await expect(
        pool.query(`UPDATE api_tokens SET ${assignment} WHERE id = $1`, [
          tokenId,
        ]),
      ).rejects.toThrow('api token authority is immutable');
    }
  });

  it('permits custodian reassignment and usage evidence', async () => {
    const tokenId = await newToken();

    // Reassigning the custodian when a researcher leaves is the whole point
    // of the column, so it sits deliberately outside the immutable set.
    await expect(
      pool.query(
        `UPDATE api_tokens SET custodian_user_id = 'user-successor'
         WHERE id = $1`,
        [tokenId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `UPDATE api_tokens SET name = 'Nightly export', last_used_at = now()
         WHERE id = $1`,
        [tokenId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    const row = await pool.query<Row>(
      `SELECT custodian_user_id, name FROM api_tokens WHERE id = $1`,
      [tokenId],
    );
    expect(row.rows[0]).toEqual({
      custodian_user_id: 'user-successor',
      name: 'Nightly export',
    });
  });

  it('makes revocation one-way', async () => {
    const tokenId = await newToken();

    // Revoking once is the write the trigger exists to admit.
    await expect(
      pool.query(
        `UPDATE api_tokens
         SET revoked_at = $2, revoked_by_user_id = 'user-admin' WHERE id = $1`,
        [tokenId, new Date('2026-04-01T09:00:00Z')],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    for (const assignment of [
      `revoked_at = now()`,
      `revoked_at = NULL, revoked_by_user_id = NULL`,
    ]) {
      await expect(
        pool.query(`UPDATE api_tokens SET ${assignment} WHERE id = $1`, [
          tokenId,
        ]),
      ).rejects.toThrow('api token authority is immutable');
    }

    const row = await pool.query<Row>(
      `SELECT revoked_by_user_id FROM api_tokens WHERE id = $1`,
      [tokenId],
    );
    expect(row.rows[0]).toEqual({ revoked_by_user_id: 'user-admin' });
  });

  it('refuses a token written into another team', async () => {
    await expect(
      tenantA.query(
        `INSERT INTO api_tokens
           (id, team_id, name, custodian_user_id, token_prefix, token_hash,
            scope_kind, access_level, created_by_user_id)
         VALUES ($1, $2, 'Smuggled', 'user-custodian', $3, $4, 'team', 'read',
                 'user-admin')`,
        [randomUUID(), TEAM_B, prefix(), hash()],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
