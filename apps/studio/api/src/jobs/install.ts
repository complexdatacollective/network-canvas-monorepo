import { Effect } from 'effect';
import type pg from 'pg';

import { splitStatements } from '../db/statements.ts';
import { Transaction } from '../db/tenant.ts';
import { jobSchemaGrantsSql, jobSchemaSql } from './schema.ts';

/** Split dollar-quote-aware rather than on `;`: the trigger body is dollar-quoted, and `@effect/sql-pg` refuses multi-command strings. */
function jobSchemaStatements(schema: string): readonly string[] {
  return [
    ...splitStatements(jobSchemaSql(schema)),
    ...splitStatements(jobSchemaGrantsSql(schema)),
  ];
}

/** Call inside a transaction: the statements are applied one at a time. */
export async function installJobSchema(
  db: pg.PoolClient,
  schema: string,
): Promise<void> {
  for (const statement of jobSchemaStatements(schema)) {
    await db.query(statement);
  }
}

export const installJobSchemaEffect = Effect.fn('installJobSchema')(function* (
  schema: string,
) {
  const { sql } = yield* Transaction;
  for (const statement of jobSchemaStatements(schema)) {
    yield* sql.unsafe(statement);
  }
});
