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

describe.skipIf(!db)('study role grants schema', () => {
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

  const grantRow = (studyId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    study_id: studyId,
    user_id: `user-${randomUUID().slice(0, 8)}`,
    role: 'manager',
    granted_by_user_id: 'user-admin',
    ...overrides,
  });

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

  it('masks contact details until PII access is granted explicitly', async () => {
    const studyId = await newStudy();
    const row = grantRow(studyId);
    await insert('study_role_grants', row);

    const stored = await pool.query<Row>(
      `SELECT pii_access FROM study_role_grants WHERE id = $1`,
      [row.id],
    );
    // The flag is orthogonal to the role and defaults closed: a Manager has no
    // contact details until someone grants them separately.
    expect(stored.rows[0]).toEqual({ pii_access: false });
  });

  it.each(['manager', 'protocol_designer', 'coordinator', 'data_viewer'])(
    'admits the %s role',
    async (role) => {
      const studyId = await newStudy();
      await expect(
        insert('study_role_grants', grantRow(studyId, { role })),
      ).resolves.toMatchObject({ rowCount: 1 });
    },
  );

  it.each([
    ['an unknown role', { role: 'owner' }, 'study_role_grants_role_check'],
    [
      'a workspace role borrowed from team_members',
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
  ])('rejects %s', async (_label, overrides, constraint) => {
    const studyId = await newStudy();
    await expect(
      insert('study_role_grants', grantRow(studyId, overrides)),
    ).rejects.toMatchObject({ constraint });
  });

  it('holds one live grant per user per study', async () => {
    const studyId = await newStudy();
    const otherStudyId = await newStudy();
    const userId = 'user-researcher';
    await insert('study_role_grants', grantRow(studyId, { user_id: userId }));

    await expect(
      insert(
        'study_role_grants',
        grantRow(studyId, { user_id: userId, role: 'coordinator' }),
      ),
    ).rejects.toMatchObject({
      constraint: 'study_role_grants_study_id_user_id_unique',
    });

    // The same person may hold a different role on a different study.
    await expect(
      insert(
        'study_role_grants',
        grantRow(otherStudyId, { user_id: userId, role: 'data_viewer' }),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('refuses a grant whose team disagrees with its study', async () => {
    const studyId = await newStudy(TEAM_A);
    await expect(
      insert('study_role_grants', grantRow(studyId, { team_id: TEAM_B })),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'study_role_grants_study_fk',
    });
  });

  it('refuses a grant over a study that does not exist', async () => {
    await expect(
      insert('study_role_grants', grantRow(randomUUID())),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'study_role_grants_study_fk',
    });
  });

  it('stops one team granting itself a role over another team', async () => {
    // Writing a row carrying the other team's id is refused by the policy...
    await expect(
      tenantA.query(
        `INSERT INTO study_role_grants
           (id, team_id, study_id, user_id, role, granted_by_user_id)
         VALUES ($1, $2, $3, 'user-intruder', 'manager', 'user-admin')`,
        [randomUUID(), TEAM_B, studyOf[TEAM_B]],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    // ...and claiming the other team's study under this team's id is refused
    // by the composite foreign key, so neither half of the pair is a way in.
    await expect(
      tenantA.query(
        `INSERT INTO study_role_grants
           (id, team_id, study_id, user_id, role, granted_by_user_id)
         VALUES ($1, $2, $3, 'user-intruder', 'manager', 'user-admin')`,
        [randomUUID(), TEAM_A, studyOf[TEAM_B]],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'study_role_grants_study_fk',
    });

    const leaked = await pool.query(
      `SELECT count(*)::int AS n FROM study_role_grants WHERE team_id = $1`,
      [TEAM_B],
    );
    expect(leaked.rows[0]).toEqual({ n: 0 });
  });

  it('shows a team only its own grants', async () => {
    const grantId = randomUUID();
    await insert('study_role_grants', {
      id: grantId,
      team_id: TEAM_B,
      study_id: studyOf[TEAM_B],
      user_id: 'user-elsewhere',
      role: 'manager',
      granted_by_user_id: 'user-admin',
    });

    const visible = await tenantA.query(
      `SELECT id FROM study_role_grants WHERE id = $1`,
      [grantId],
    );
    expect(visible.rows).toEqual([]);

    // The positive control: the login that no policy binds does see it.
    const login = await pool.query(
      `SELECT id FROM study_role_grants WHERE id = $1`,
      [grantId],
    );
    expect(login.rows).toEqual([{ id: grantId }]);
  });

  it('keeps a grant mutable and removable: the audit log is the history', async () => {
    const studyId = await newStudy();
    const row = grantRow(studyId);
    await insert('study_role_grants', row);

    // Changing someone's role is an UPDATE, and PII access is granted on top
    // of an existing role rather than by reissuing the grant.
    await expect(
      pool.query(
        `UPDATE study_role_grants
         SET role = 'coordinator', pii_access = true, updated_at = now()
         WHERE id = $1`,
        [row.id],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    // Removing them is a DELETE: there is no revocation tombstone.
    await expect(
      pool.query(`DELETE FROM study_role_grants WHERE id = $1`, [row.id]),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});
