import { Effect } from 'effect';
import type pg from 'pg';

import { splitStatements } from '../db/statements.ts';
import { Transaction } from './database.ts';
import { jobSchemaGrantsSql, jobSchemaSql } from './schema.ts';

// Installing the queue's schema, in both shapes a caller can need it.
//
// A dedicated schema (`studio_jobs`) rather than `public` because
// `scripts/apply.ts` pushes `public` with drizzle-kit, which reconciles what it
// introspects against what Drizzle declares — a jobs table in `public` would
// be dropped as unmanaged on the next push.
//
// Two functions because two drivers do the same work for two lifetimes. The
// node-postgres one is what `applySchema` and `studio-api migrate` call: both
// already hold one client inside one transaction and apply everything through
// it. The Effect one is for a program that owns its own `Database` and creates
// the schema through `withTransaction` (the suites' harness does). They share
// the statements, so the bytes cannot drift between the path that installs a
// deployment and the path that installs a suite's scratch schema.

/**
 * The queue's DDL and grants as single commands.
 *
 * Split with the dollar-quote-aware splitter rather than on `;`: the schema
 * carries a plpgsql trigger function whose body is dollar-quoted and full of
 * statement terminators, and `@effect/sql-pg` refuses a multi-command string
 * outright (src/db/statements.ts). node-postgres would accept the whole script
 * in one `query`, but sending the same list from both paths is what makes them
 * comparable.
 */
function jobSchemaStatements(schema: string): readonly string[] {
  return [
    ...splitStatements(jobSchemaSql(schema)),
    ...splitStatements(jobSchemaGrantsSql(schema)),
  ];
}

/**
 * Installs the queue's schema through node-postgres.
 *
 * **Call inside a transaction**: the
 * statements are applied one at a time, so a failure part-way would otherwise
 * leave a schema with some of its tables.
 *
 * Idempotent, because the DDL is (`CREATE SCHEMA IF NOT EXISTS`,
 * `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
 * `CREATE OR REPLACE FUNCTION`/`TRIGGER`) — so a schema application that finds
 * the schema already present reapplies it rather than refusing or dropping it.
 * There is no version stamp of its own to compare: the DDL is inside
 * `SCHEMA_FINGERPRINT`, so a change to it is a stale database like any other.
 */
export async function installJobSchema(
  db: pg.PoolClient,
  schema: string,
): Promise<void> {
  for (const statement of jobSchemaStatements(schema)) {
    await db.query(statement);
  }
}

/**
 * The same install over an open `Transaction` — stage 3's path, and the one
 * the queue's own suites can use once they build a `Database` rather than a
 * `pg.Pool`. `Transaction` and not `Database` for the reason `Jobs.enqueue`
 * takes it: the requirement is what says this runs inside a transaction
 * somebody else opened.
 */
export const installJobSchemaEffect = Effect.fn('installJobSchema')(function* (
  schema: string,
) {
  const { sql } = yield* Transaction;
  for (const statement of jobSchemaStatements(schema)) {
    yield* sql.unsafe(statement);
  }
});
