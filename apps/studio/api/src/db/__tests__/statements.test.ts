import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderSchemaDdl } from '../../../scripts/render-schema-ddl.ts';
import {
  openTestDatabase,
  ownerRows,
  refusalOf,
  TestDatabase,
  TestDatabaseLive,
  type TestDatabaseRuntime,
  testDb,
} from '../../__tests__/support/database.ts';
import { scratchSchemaDdl } from '../../__tests__/support/schema-ddl.ts';
import { jobSchemaGrantsSql, jobSchemaSql } from '../../jobs/schema.ts';
import { SIDECARS } from '../schema.ts';
import { splitStatements } from '../statements.ts';

const RENDER_TIMEOUT_MS = 180_000;

describe('splitStatements', () => {
  it('keeps a dollar-quoted function body whole', () => {
    const script = `CREATE FUNCTION bump() RETURNS trigger AS $$
BEGIN
  UPDATE counts SET n = n + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TABLE counts (n int)`;

    const statements = splitStatements(script);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('UPDATE counts SET n = n + 1;');
    expect(statements[0]).toMatch(/\$\$ LANGUAGE plpgsql$/);
    expect(statements[1]).toBe('CREATE TABLE counts (n int)');
  });

  it('closes a tagged body only on its own tag', () => {
    const script = `CREATE FUNCTION shout() RETURNS text AS $body$
BEGIN
  RETURN 'a$$b';
END;
$body$ LANGUAGE plpgsql;`;

    const statements = splitStatements(script);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("'a$$b'");
  });

  it('ignores a semicolon inside a string literal', () => {
    expect(splitStatements(`select 'a;b';`)).toEqual([`select 'a;b'`]);
    expect(splitStatements(`select 'it''s; fine';`)).toEqual([
      `select 'it''s; fine'`,
    ]);
    expect(splitStatements(`select E'\\'; still one';`)).toEqual([
      `select E'\\'; still one'`,
    ]);
    expect(splitStatements(`select 'a\\'; select 2;`)).toEqual([
      `select 'a\\'`,
      'select 2',
    ]);
  });

  it('ignores a semicolon inside a quoted identifier', () => {
    expect(splitStatements(`select * from "odd;name";`)).toEqual([
      `select * from "odd;name"`,
    ]);
  });

  it('ignores a semicolon inside a comment, and keeps the comment', () => {
    expect(splitStatements('select 1 -- one; two\n;')).toEqual([
      'select 1 -- one; two',
    ]);
    expect(splitStatements('select /* a; /* nested; */ b */ 1;')).toEqual([
      'select /* a; /* nested; */ b */ 1',
    ]);
    expect(splitStatements('-- queues [{"name":"sign-in-email"}]\n')).toEqual(
      [],
    );
    expect(splitStatements('/* nothing; here */')).toEqual([]);
  });

  it('drops empty fragments and keeps an unterminated tail', () => {
    expect(splitStatements('select 1')).toEqual(['select 1']);
    expect(splitStatements('select 1;;select 2')).toEqual([
      'select 1',
      'select 2',
    ]);
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('   \n\t ')).toEqual([]);
  });

  it('reads a `$` inside an identifier as part of the name', () => {
    expect(splitStatements('select * from my$tbl$name; select 2;')).toEqual([
      'select * from my$tbl$name',
      'select 2',
    ]);
  });

  it('reads a positional parameter as ordinary text', () => {
    const script = `select pg_notify($1, $2::text);`;
    expect(splitStatements(script)).toEqual(['select pg_notify($1, $2::text)']);
  });

  it('returns an unterminated construct with the last statement', () => {
    expect(splitStatements("select 1; select 'unclosed")).toEqual([
      'select 1',
      "select 'unclosed",
    ]);
    expect(splitStatements('select 1; select $$unclosed')).toEqual([
      'select 1',
      'select $$unclosed',
    ]);
    expect(splitStatements('select 1; /* unclosed; ')).toEqual(['select 1']);
  });

  it('cuts the job grants into one GRANT each', () => {
    const grants = splitStatements(jobSchemaGrantsSql('studio_jobs'));

    expect(grants).toHaveLength(5);
    expect(grants.every((statement) => statement.startsWith('GRANT'))).toBe(
      true,
    );
    expect(grants).toEqual(
      jobSchemaGrantsSql('studio_jobs')
        .split('\n')
        .map((line) => line.replace(/;$/, '')),
    );
    expect(grants[0]).toMatch(/^GRANT USAGE ON SCHEMA studio_jobs TO /);
  });

  it(
    'cuts every rendered schema statement into at least one command',
    async () => {
      const ddl = await renderSchemaDdl();
      const drizzleCount = ddl.statements.length - SIDECARS.length;

      expect(drizzleCount).toBeGreaterThan(0);
      expect(ddl.statements.slice(drizzleCount)).toEqual(SIDECARS);

      const drizzleSplits = ddl.statements
        .slice(0, drizzleCount)
        .map((statement) => splitStatements(statement).length);
      expect(drizzleSplits.filter((count) => count !== 1)).toEqual([]);

      const sidecarSplits = SIDECARS.map(
        (sidecar) => splitStatements(sidecar).length,
      );
      expect(sidecarSplits.every((count) => count >= 1)).toBe(true);
      expect(Math.max(...sidecarSplits)).toBeGreaterThan(1);

      const naiveSplits = SIDECARS.map(
        (sidecar) =>
          sidecar.split(';').filter((fragment) => fragment.trim() !== '')
            .length,
      );
      expect(
        sidecarSplits.some((count, index) => count < naiveSplits[index]!),
      ).toBe(true);
    },
    RENDER_TIMEOUT_MS,
  );
});

async function catalogue(pool: pg.ClientBase, schema: string) {
  const list = async (sql: string) =>
    (await pool.query<{ entry: string }>(sql, [schema])).rows.map(
      (row) => row.entry,
    );

  return {
    tables: await list(
      `select c.relname as entry
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relkind in ('r', 'p')
        order by 1`,
    ),
    functions: await list(
      `select p.proname || '(' || pg_get_function_arguments(p.oid) || ')' as entry
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = $1
        order by 1`,
    ),
    triggers: await list(
      `select t.tgname || ' on ' || c.relname as entry
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and not t.tgisinternal
        order by 1`,
    ),
    policies: await list(
      `select pol.polname || ' on ' || c.relname as entry
         from pg_policy pol
         join pg_class c on c.oid = pol.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1
        order by 1`,
    ),
    indexes: await list(
      `select c.relname as entry
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relkind = 'i'
        order by 1`,
    ),
  };
}

// This comparison stays on node-postgres: its reference side is the whole DDL
// sent as one multi-command simple query, a path `@effect/sql-pg` does not have.
describe.skipIf(!testDb)('splitStatements against Postgres', () => {
  let whole: { client: pg.Client; schema: string } | undefined;
  let split: TestDatabaseRuntime | undefined;

  beforeAll(async () => {
    if (!testDb) throw new Error('unreachable: probe guaranteed a database');
    split = await openTestDatabase();
    const client = new pg.Client({ connectionString: testDb.url });
    await client.connect();
    whole = { client, schema: `${split.harness.schema}_whole` };
    await client.query(`create schema "${whole.schema}"`);
    await client.query(`set search_path to "${whole.schema}"`);
    await client.query(await scratchSchemaDdl());
  }, RENDER_TIMEOUT_MS);

  afterAll(async () => {
    await whole?.client
      .query(`drop schema if exists "${whole.schema}" cascade`)
      .catch(() => undefined);
    await whole?.client.end().catch(() => undefined);
    await split?.dispose().catch(() => undefined);
  });

  it('builds the same schema as executing the whole script', async () => {
    if (!whole || !split)
      throw new Error('unreachable: beforeAll provisioned both');
    const expected = await catalogue(whole.client, whole.schema);
    const actual = await catalogue(whole.client, split.harness.schema);

    expect(expected.tables.length).toBeGreaterThan(0);
    expect(expected.functions.length).toBeGreaterThan(0);
    expect(expected.triggers.length).toBeGreaterThan(0);
    expect(expected.policies.length).toBeGreaterThan(0);
    expect(expected.indexes.length).toBeGreaterThan(0);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!testDb)('splitStatements on the Effect driver', () => {
  layer(TestDatabaseLive)('over a provisioned schema', (suite) => {
    suite.effect(
      'cuts a multi-command string into commands the driver accepts',
      () =>
        Effect.gen(function* () {
          const script = 'select 1 as a; select 2 as b';
          const refused = yield* refusalOf(ownerRows(script));
          expect(refused.state).toBe('42601');

          const [first, second] = splitStatements(script);
          expect(yield* ownerRows(first!)).toEqual([{ a: 1 }]);
          expect(yield* ownerRows(second!)).toEqual([{ b: 2 }]);
        }),
    );

    suite.effect('installs the job schema one statement at a time', () =>
      Effect.gen(function* () {
        const harness = yield* TestDatabase;
        const jobSchema = `${harness.jobSchema}_split`;
        const statements = [
          ...splitStatements(jobSchemaSql(jobSchema)),
          ...splitStatements(jobSchemaGrantsSql(jobSchema)),
        ];
        expect(statements.length).toBeGreaterThan(5);

        yield* harness.onOwner(
          Effect.forEach(
            statements,
            (statement) => harness.owner.sql.unsafe(statement),
            { discard: true },
          ),
        );

        const functions = yield* ownerRows<{ proname: string }>(
          `select p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = $1`,
          [jobSchema],
        );
        expect(functions.map((row) => row.proname)).toEqual(['notify_job']);

        const tables = yield* ownerRows<{ tablename: string }>(
          `select tablename from pg_tables where schemaname = $1 order by 1`,
          [jobSchema],
        );
        expect(tables.map((row) => row.tablename)).toEqual([
          'job_schedules',
          'jobs',
        ]);
      }).pipe(
        Effect.ensuring(
          Effect.flatMap(TestDatabase, (harness) =>
            Effect.ignore(
              ownerRows(
                `drop schema if exists "${harness.jobSchema}_split" cascade`,
              ),
            ),
          ),
        ),
      ),
    );
  });
});
