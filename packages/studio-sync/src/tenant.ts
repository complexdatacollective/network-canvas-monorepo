// A pool handle pinned to one team: the only way the data layer runs SQL
// against tenant tables. Every statement runs inside a transaction that
// stamps app.team_id as a transaction-local GUC, which is what the row-level
// security policies read (rls.ts): a statement that forgets its team
// predicate sees nothing rather than another team's rows. The explicit
// predicates stay — they lead the team-first indexes and hold even where RLS
// is bypassed.
import pg from 'pg';

import { TEAM_GUC } from './rls.ts';

export type TenantTransactionOptions = {
  isolation?: 'repeatable read';
};

export type TenantDb = {
  readonly teamId: string;
  /** A single statement in its own team-stamped transaction. */
  query(text: string, values?: unknown[]): Promise<pg.QueryResult>;
  transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
    opts?: TenantTransactionOptions,
  ): Promise<T>;
};

export function createTenantDb(pool: pg.Pool, teamId: string): TenantDb {
  const transaction = async <T>(
    work: (client: pg.PoolClient) => Promise<T>,
    opts?: TenantTransactionOptions,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      // SET LOCAL cannot take a bind parameter, so the team id rides the
      // BEGIN round trip as an escaped literal.
      const begin =
        opts?.isolation === 'repeatable read'
          ? 'BEGIN ISOLATION LEVEL REPEATABLE READ'
          : 'BEGIN';
      await client.query(
        `${begin}; SET LOCAL ${TEAM_GUC} = ${pg.escapeLiteral(teamId)}`,
      );
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  return {
    teamId,
    query: (text, values) =>
      transaction((client) => client.query(text, values)),
    transaction,
  };
}
