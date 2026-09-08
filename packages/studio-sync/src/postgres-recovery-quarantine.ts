import type pg from 'pg';

import { assertSamePostgresDatabase } from './postgres-database-identity.ts';

const FAILURE = 'POSTGRES_RECOVERY_QUARANTINE_REQUIRED';

export type PostgresRecoveryTransaction = {
  isolation: 'repeatable read' | 'serializable';
  readOnly: boolean;
};

/** Prove that an offline recovery transaction is the only writer-capable
 * client on the restored target. Administrative clients on other databases
 * remain available for recovery operations. */
export async function assertPostgresRecoveryQuarantine(
  client: pg.PoolClient,
  observer: pg.PoolClient,
  options: {
    runtimeRoles: readonly string[];
    allowedLogins: readonly string[];
    administrativeLogins: readonly string[];
    allowedClientPids?: readonly number[];
    transaction: PostgresRecoveryTransaction;
  },
): Promise<void> {
  const allowedLogins = [...options.allowedLogins];
  const administrativeLogins = [...options.administrativeLogins];
  const runtimeRoles = [...options.runtimeRoles];
  const transaction = { ...options.transaction };
  if (
    runtimeRoles.length === 0 ||
    new Set(runtimeRoles).size !== runtimeRoles.length
  )
    throw new Error(FAILURE);
  const allowedClientPids = [...(options.allowedClientPids ?? [])];
  const writer = (
    await client.query<{ safe: boolean; pid: number; login: string }>(
      `SELECT pg_catalog.current_setting('transaction_read_only') = $1
       AND pg_catalog.current_setting('transaction_isolation') = $2 AS safe,
       pg_catalog.pg_backend_pid() AS pid, session_user AS login`,
      [transaction.readOnly ? 'on' : 'off', transaction.isolation],
    )
  ).rows[0];
  if (!writer?.safe) throw new Error(FAILURE);
  await assertSamePostgresDatabase(client, observer);
  // A repeatable-read/serializable snapshot would hide a LOGIN reopened
  // during recovery. Statistics invalidation does not refresh catalog MVCC.
  // Observe roles through the same pinned, read-committed backup connection.
  await observer.query('SELECT pg_catalog.pg_stat_clear_snapshot()');
  const result = await observer.query<{ safe: boolean }>(
    `WITH database_identity AS MATERIALIZED (
       SELECT database.datdba AS owner_oid
       FROM pg_catalog.pg_database database
       WHERE database.datname = pg_catalog.current_database()
     ), runtime_logins AS MATERIALIZED (
       SELECT login.oid, login.rolcanlogin
       FROM pg_catalog.pg_roles login
       WHERE login.rolname = ANY($1::pg_catalog.text[])
         AND NOT login.rolname = ANY($2::pg_catalog.text[])
         AND login.oid <> (SELECT owner_oid FROM database_identity)
         AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members membership
           JOIN pg_catalog.pg_roles role ON role.oid = membership.roleid
           WHERE membership.member = login.oid
             AND role.rolname = ANY($3::pg_catalog.text[])
         )
     ), writer_logins AS MATERIALIZED (
       SELECT login.oid, login.rolcanlogin
       FROM pg_catalog.pg_roles login
       WHERE login.rolname = ANY($1::pg_catalog.text[])
         AND login.rolname <> $8
         AND (
           login.rolname = ANY($2::pg_catalog.text[])
           OR login.oid = (SELECT owner_oid FROM database_identity)
           OR login.oid IN (SELECT oid FROM runtime_logins)
         )
     ) SELECT
       pg_catalog.current_setting('transaction_read_only') = $4
       AND pg_catalog.current_setting('transaction_isolation') = $5
       AND (SELECT count(*) FROM runtime_logins) = $6::pg_catalog.int4
       AND NOT EXISTS (SELECT 1 FROM writer_logins WHERE rolcanlogin)
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_stat_activity activity
         WHERE activity.datname = pg_catalog.current_database()
           AND activity.usesysid IS NOT NULL
           AND activity.pid <> pg_catalog.pg_backend_pid()
           AND NOT activity.pid = ANY($7::pg_catalog.int4[])
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_prepared_xacts prepared
         WHERE prepared.database = pg_catalog.current_database()
       ) AS safe`,
    [
      allowedLogins,
      administrativeLogins,
      runtimeRoles,
      'on',
      'read committed',
      runtimeRoles.length,
      [...allowedClientPids, writer.pid],
      writer.login,
    ],
  );
  if (result.rows[0]?.safe !== true) throw new Error(FAILURE);
}
