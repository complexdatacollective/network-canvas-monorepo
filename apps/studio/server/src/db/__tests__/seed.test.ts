import { verifyPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';

import { TEAM_ROLES } from '@codaco/studio-rpc';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_NAME,
  SEED_ADMIN_PASSWORD,
  seed,
} from '../seed.ts';

const db = await reachableDb();

describe.skipIf(!db)('seed', () => {
  it('creates an admin who can sign in with the published password and owns every team', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const { pool, dispose } = await createScratchSchema(db);
    try {
      await provisionScratchSchema(pool);
      await seed(pool);

      const admin = await pool.query<{
        id: string;
        name: string;
        emailVerified: boolean;
      }>(`select id, name, "emailVerified" from "user" where email = $1`, [
        SEED_ADMIN_EMAIL,
      ]);
      expect(admin.rows).toEqual([
        { id: expect.any(String), name: SEED_ADMIN_NAME, emailVerified: true },
      ]);
      const adminId = admin.rows[0]!.id;

      const account = await pool.query<{ password: string | null }>(
        `select password from account where "userId" = $1 and "providerId" = 'credential'`,
        [adminId],
      );
      expect(account.rows).toHaveLength(1);
      const hash = account.rows[0]!.password;
      expect(hash).not.toBeNull();
      await expect(
        verifyPassword({ hash: hash!, password: SEED_ADMIN_PASSWORD }),
      ).resolves.toBe(true);
      await expect(
        verifyPassword({ hash: hash!, password: 'not the password' }),
      ).resolves.toBe(false);

      const teams = await pool.query<{ count: number }>(
        `select count(*)::int as count from teams`,
      );
      const adminMemberships = await pool.query<{ role: string }>(
        `select role from team_members where user_id = $1`,
        [adminId],
      );
      expect(adminMemberships.rows).toHaveLength(teams.rows[0]!.count);
      expect(adminMemberships.rows.every((row) => row.role === 'owner')).toBe(
        true,
      );

      const otherMembers = await pool.query<{ role: string }>(
        `select role from team_members where user_id <> $1`,
        [adminId],
      );
      expect(otherMembers.rows.length).toBeGreaterThan(0);
      for (const { role } of otherMembers.rows) {
        expect(TEAM_ROLES).toContain(role);
      }
    } finally {
      await dispose();
    }
  });

  it('wipes prior data so re-seeding never collides on unique constraints', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const { pool, dispose } = await createScratchSchema(db);
    try {
      await provisionScratchSchema(pool);
      await seed(pool);
      const firstRun = await pool.query(
        `select name, slug from teams order by slug`,
      );

      // Re-seeding must not error on the unique constraints (team slug, user
      // email) a naive additive seed would collide on the second time around.
      await expect(seed(pool)).resolves.toBeUndefined();
      const secondRun = await pool.query(
        `select name, slug from teams order by slug`,
      );
      expect(secondRun.rows).toEqual(firstRun.rows);
    } finally {
      await dispose();
    }
  });
});
