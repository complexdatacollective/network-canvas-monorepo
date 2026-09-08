import { randomBytes } from 'node:crypto';

import type pg from 'pg';

/** Both clients must remain in caller-owned transactions. A database-scoped,
 * transaction-owned lock proves that both sockets reach the same live database,
 * including when restored copies retain matching names and application stamps.
 * Nonblocking acquisition also makes a coincidental lock collision a refusal. */
export async function assertSamePostgresDatabase(
  first: pg.PoolClient,
  second: pg.PoolClient,
): Promise<void> {
  try {
    const key = randomBytes(8).readBigInt64BE().toString();
    const held = await first.query<{ acquired: boolean }>(
      'SELECT pg_catalog.pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [key],
    );
    if (held.rows[0]?.acquired !== true) throw new Error();
    const observed = await second.query<{ acquired: boolean }>(
      'SELECT pg_catalog.pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [key],
    );
    if (observed.rows[0]?.acquired !== false) throw new Error();
  } catch {
    throw new Error('POSTGRES_DATABASES_DO_NOT_MATCH');
  }
}
