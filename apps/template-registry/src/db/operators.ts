import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { appendRegistryAudit, registryTransaction } from './transaction.ts';

/** Only the database owner/operator can enroll a verified registry account. */
export async function changeRegistryOperator(
  pool: pg.Pool,
  userId: string,
  enabled: boolean,
): Promise<void> {
  if (
    !userId ||
    userId.length > 255 ||
    !userId.isWellFormed() ||
    userId.includes('\0')
  )
    throw new Error('REGISTRY_OPERATOR_ARGUMENTS_INVALID');
  await registryTransaction(pool, async (client) => {
    const role = (
      await client.query<{ actor: string; authorized: boolean }>(
        `SELECT current_user AS actor, (role.rolsuper OR role.oid = database.datdba) AS authorized
       FROM pg_roles role JOIN pg_database database ON database.datname = current_database()
       WHERE role.rolname = current_user`,
      )
    ).rows[0];
    if (!role?.authorized)
      throw new Error('REGISTRY_OPERATOR_NOT_DATABASE_OWNER');
    const account = await client.query<{ id: string }>(
      'SELECT id FROM registry_auth_user WHERE id = $1 AND email_verified = true',
      [userId],
    );
    if (account.rows.length !== 1)
      throw new Error('REGISTRY_OPERATOR_ACCOUNT_NOT_VERIFIED');
    await client.query(
      `INSERT INTO registry_operators(user_id, enabled) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET enabled = excluded.enabled`,
      [userId, enabled],
    );
    await appendRegistryAudit(
      client,
      { kind: 'database_operator', id: role.actor },
      enabled ? 'operator.granted' : 'operator.revoked',
      userId,
      randomUUID(),
    );
  });
}
