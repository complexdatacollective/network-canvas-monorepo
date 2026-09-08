import { expect, it } from 'vitest';

import { createRegistryTestDatabase } from '../__tests__/database.ts';
import { changeRegistryOperator } from './operators.ts';
import { REGISTRY_TABLES, registrySidecarSql } from './schema.ts';

it('requires a real database owner and verified account, binds grant/revoke to immutable audit, and rolls back if audit fails', async () => {
  const database = await createRegistryTestDatabase(
    REGISTRY_TABLES,
    registrySidecarSql,
  );
  try {
    await database.owner
      .query(`INSERT INTO registry_auth_user(id, name, email, email_verified, created_at, updated_at)
      VALUES ('verified', 'Verified', 'verified@example.test', true, now(), now()),
        ('unverified', 'Unverified', 'unverified@example.test', false, now(), now())`);
    for (const pool of [database.pool, database.operatorPool])
      await expect(
        changeRegistryOperator(pool, 'verified', true),
      ).rejects.toThrow('REGISTRY_OPERATOR_NOT_DATABASE_OWNER');
    for (const id of ['unverified', 'missing'])
      await expect(
        changeRegistryOperator(database.owner, id, true),
      ).rejects.toThrow('REGISTRY_OPERATOR_ACCOUNT_NOT_VERIFIED');
    expect(
      (await database.owner.query('SELECT * FROM registry_operators')).rows,
    ).toEqual([]);
    expect(
      (await database.owner.query('SELECT * FROM registry_audit')).rows,
    ).toEqual([]);
    await changeRegistryOperator(database.owner, 'verified', true);
    expect(
      (
        await database.owner.query(
          'SELECT user_id, enabled FROM registry_operators',
        )
      ).rows,
    ).toEqual([{ user_id: 'verified', enabled: true }]);
    await changeRegistryOperator(database.owner, 'verified', false);
    expect(
      (
        await database.owner.query(
          'SELECT user_id, enabled FROM registry_operators',
        )
      ).rows,
    ).toEqual([{ user_id: 'verified', enabled: false }]);
    expect(
      (
        await database.owner.query(
          'SELECT actor_kind, action, subject_id FROM registry_audit ORDER BY occurred_at',
        )
      ).rows,
    ).toEqual([
      {
        actor_kind: 'database_operator',
        action: 'operator.granted',
        subject_id: 'verified',
      },
      {
        actor_kind: 'database_operator',
        action: 'operator.revoked',
        subject_id: 'verified',
      },
    ]);
    await expect(
      database.owner.query(
        "DELETE FROM registry_audit WHERE subject_id = 'verified'",
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await database.owner
      .query(`CREATE FUNCTION reject_operator_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$;
      CREATE TRIGGER reject_operator_audit BEFORE INSERT ON registry_audit FOR EACH ROW EXECUTE FUNCTION reject_operator_audit()`);
    await expect(
      changeRegistryOperator(database.owner, 'verified', true),
    ).rejects.toThrow('synthetic audit unavailable');
    expect(
      (await database.owner.query('SELECT enabled FROM registry_operators'))
        .rows,
    ).toEqual([{ enabled: false }]);
    expect(
      (
        await database.owner.query(
          'SELECT count(*)::int AS count FROM registry_audit',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  } finally {
    await database.dispose();
  }
});
