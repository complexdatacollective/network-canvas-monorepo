import { pushSchema } from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect } from 'effect';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applySchema } from '../../../scripts/apply.ts';
import {
  committedMigrations,
  createOwnedScratchDatabase,
  type OwnedScratchDatabase,
} from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { JOB_SCHEMA } from '../../jobs/queues.ts';
import { OwnerDatabase } from '../client.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import { HISTORY_TABLE } from '../history.ts';
import { migrateDatabaseEffect } from '../migrate.ts';
import { SCHEMA } from '../schema.ts';

// The proof that the migrations are the schema (#1901 S-1). DB-A is built the
// way every deployment is: every committed migration, from empty, through the
// runner. DB-B is built the way development is: drizzle-kit's push of SCHEMA,
// then the sidecars and the job schema. The two must be the same database.
//
// It catches what re-running sidecars cannot undo: a trigger, function,
// overload or grant removed from a sidecar stays in every migrated database,
// and a `studio_jobs` table, index or CHECK changed inside a `CREATE … IF NOT
// EXISTS` never changes in one. Each needs a hand-written statement in the
// migration, and this is what notices when it is missing.
//
// Both are built by a NOSUPERUSER owner (S-2), the shape of managed Postgres.

const db = await reachableDb();

const SCHEMAS = ['public', JOB_SCHEMA];
/** The migration system's own bookkeeping, which only DB-A has by design. */
const EXCLUDED = [HISTORY_TABLE, 'schemaFingerprint'];

const sortedAcl = (acl: string | null) =>
  acl === null
    ? null
    : acl
        .replace(/^\{|\}$/g, '')
        .split(',')
        .toSorted();

async function catalogSnapshot(pool: pg.Pool) {
  const rows = async <Row extends Record<string, unknown>>(
    statement: string,
  ): Promise<Row[]> =>
    (await pool.query<Row>(statement, [SCHEMAS, EXCLUDED])).rows;

  const functions = await rows<{ id: string; def: string; acl: string | null }>(
    `select p.oid::regprocedure::text as id,
            pg_get_functiondef(p.oid) as def,
            p.proacl::text as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = any($1) and p.prokind in ('f', 'p')
        and cardinality($2::text[]) >= 0
      order by 1`,
  );
  const triggers = await rows(
    `select c.relname as "table", t.tgname as name,
            pg_get_triggerdef(t.oid) as def, t.tgenabled as enabled
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname = any($1)
        and c.relname <> all($2)
      order by 1, 2`,
  );
  const indexes = await rows(
    `select schemaname, tablename, indexname, indexdef from pg_indexes
      where schemaname = any($1) and tablename <> all($2)
      order by 1, 2, 3`,
  );
  const constraints = await rows(
    `select n.nspname as schema, c.relname as "table", k.conname as name,
            pg_get_constraintdef(k.oid) as def
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1) and c.relname <> all($2)
      order by 1, 2, 3`,
  );
  const relations = (
    await rows<{
      schema: string;
      name: string;
      kind: string;
      rowsecurity: boolean;
      forcerowsecurity: boolean;
      acl: string | null;
    }>(
      `select n.nspname as schema, c.relname as name, c.relkind as kind,
              c.relrowsecurity as rowsecurity,
              c.relforcerowsecurity as forcerowsecurity,
              c.relacl::text as acl
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any($1) and c.relkind in ('r', 'p', 'v', 'm', 'S')
          and c.relname <> all($2)
        order by 1, 2`,
    )
  ).map((relation) => ({ ...relation, acl: sortedAcl(relation.acl) }));
  const columns = (
    await rows<{ acl: string | null } & Record<string, unknown>>(
      `select table_schema, table_name, column_name, data_type, udt_name,
              column_default, is_nullable,
              (select a.attacl::text from pg_attribute a
                where a.attrelid = format('%I.%I', table_schema, table_name)::regclass
                  and a.attname = column_name) as acl
         from information_schema.columns
        where table_schema = any($1) and table_name <> all($2)
        order by 1, 2, 3`,
    )
  ).map((column) => ({ ...column, acl: sortedAcl(column.acl) }));
  const schemas = (
    await rows<{ name: string; acl: string | null }>(
      `select nspname as name, nspacl::text as acl from pg_namespace
        where nspname = any($1) and cardinality($2::text[]) >= 0
        order by 1`,
    )
  ).map((schema) => ({ ...schema, acl: sortedAcl(schema.acl) }));
  const policies = await rows(
    `select schemaname, tablename, policyname, permissive, roles::text, cmd,
            qual, with_check
       from pg_policies
      where schemaname = any($1) and tablename <> all($2)
      order by 1, 2, 3`,
  );
  // Cluster-wide, so both databases see the same rows; it is here so that a
  // migration that stops granting the owner its roles shows up as a
  // difference from what the push path grants, should the two ever diverge.
  const memberships = await rows(
    `select roleid::regrole::text as role, member::regrole::text as member,
            admin_option, inherit_option, set_option
       from pg_auth_members
      where roleid::regrole::text in ('studio_app', 'studio_maintenance')
        and cardinality($1::text[]) >= 0 and cardinality($2::text[]) >= 0
      order by 1, 2`,
  );

  return {
    functions,
    triggers,
    indexes,
    constraints,
    relations,
    columns,
    schemas,
    policies,
    memberships,
  };
}

describe.skipIf(!db)('the committed migrations, against the push path', () => {
  let migrated: OwnedScratchDatabase;
  let pushed: OwnedScratchDatabase;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    migrated = await createOwnedScratchDatabase(db);
    pushed = await createOwnedScratchDatabase(db);
    await Effect.runPromise(
      migrateDatabaseEffect(committedMigrations()).pipe(
        Effect.provide(OwnerDatabase.layer(migrated.db)),
      ),
    );
    await applySchema(pushed.pool);
  }, 300_000);

  afterAll(async () => {
    await migrated?.dispose().catch(() => undefined);
    await pushed?.dispose().catch(() => undefined);
  }, 120_000);

  it('leave drizzle-kit nothing to push', async () => {
    const push = await pushSchema(SCHEMA, drizzle({ client: migrated.pool }), {
      schemas: ['public'],
      // The history table is the runner's, outside SCHEMA by design.
      tables: [`!${HISTORY_TABLE}`],
      entities: undefined,
      extensions: undefined,
    });
    expect(push.sqlStatements).toEqual([]);
  }, 120_000);

  it('build the same catalog as the push path', async () => {
    const [left, right] = [
      await catalogSnapshot(migrated.pool),
      await catalogSnapshot(pushed.pool),
    ];
    // The guard on the guard: each comparison has something in it.
    for (const [part, entries] of Object.entries(left)) {
      expect(entries.length, part).toBeGreaterThan(0);
    }
    for (const part of Object.keys(left) as (keyof typeof left)[]) {
      expect(left[part], part).toEqual(right[part]);
    }
  }, 120_000);

  it('stamp both with this build’s fingerprint', async () => {
    for (const scratch of [migrated, pushed]) {
      const stamp = await scratch.pool.query<{ fingerprint: string }>(
        'select "fingerprint" from "schemaFingerprint"',
      );
      expect(stamp.rows).toEqual([{ fingerprint: SCHEMA_FINGERPRINT }]);
    }
  });
});
