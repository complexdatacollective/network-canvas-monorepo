// A pool handle pinned to one team: the only way the data layer runs SQL
// against tenant tables. transaction() stamps app.team_id as a
// transaction-local GUC so row-level security can enforce the same boundary
// later; until then every statement carries an explicit team predicate.
import pg from 'pg';

export type TenantTransactionOptions = {
  isolation?: 'repeatable read';
};

export type TenantDb = {
  readonly teamId: string;
  query(text: string, values?: unknown[]): Promise<pg.QueryResult>;
  transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
    opts?: TenantTransactionOptions,
  ): Promise<T>;
};

export function createTenantDb(pool: pg.Pool, teamId: string): TenantDb {
  return {
    teamId,
    query: (text, values) => pool.query(text, values),
    transaction: async (work, opts) => {
      const client = await pool.connect();
      try {
        // SET LOCAL cannot take a bind parameter, so the team id rides the
        // BEGIN round trip as an escaped literal.
        const begin =
          opts?.isolation === 'repeatable read'
            ? 'BEGIN ISOLATION LEVEL REPEATABLE READ'
            : 'BEGIN';
        await client.query(
          `${begin}; SET LOCAL app.team_id = ${pg.escapeLiteral(teamId)}`,
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
    },
  };
}
