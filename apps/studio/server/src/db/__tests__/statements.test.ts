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

// The scanner is proved twice: on scripts written here, where the awkward case
// is visible in the test, and on the corpora Studio actually applies — where a
// cut in the wrong place is a syntax error at deployment time rather than a
// failing unit case.

/** Rendering the DDL imports drizzle-kit and diffs the whole schema. */
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
    // The `$$` inside is body text: a scanner that closed on any dollar pair
    // would end the string here and cut the statement at the next `;`.
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
    // E'…': the backslash escapes the quote, so the literal runs on.
    expect(splitStatements(`select E'\\'; still one';`)).toEqual([
      `select E'\\'; still one'`,
    ]);
    // And a plain literal is read with standard_conforming_strings on, where
    // that same backslash is an ordinary character and the quote closes.
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
    // Postgres block comments nest, so the first `*/` closes the inner one.
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
    // Postgres allows `$` as an identifier continuation character, and a
    // dollar quote must be separated from a preceding identifier by whitespace.
    // Reading `$tbl$` here as an opener would swallow the rest of the script.
    expect(splitStatements('select * from my$tbl$name; select 2;')).toEqual([
      'select * from my$tbl$name',
      'select 2',
    ]);
  });

  it('reads a positional parameter as ordinary text', () => {
    // `$1` is not a dollar-quote opener; treating it as one would swallow the
    // rest of the script into a string that never closes.
    const script = `select pg_notify($1, $2::text);`;
    expect(splitStatements(script)).toEqual(['select pg_notify($1, $2::text)']);
  });

  it('returns an unterminated construct with the last statement', () => {
    // Documented behaviour rather than an oversight: the malformed tail goes
    // to the server, which names the syntax error at the statement that has it.
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
    // One line each and in the declared order, checked against the source's
    // own lines: the grants are single-line by construction, so a splitter
    // that merged two or dropped one shows up here as a different list.
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
      // Where the boundary is: everything after drizzle-kit's output is a
      // sidecar, so the two halves below are the halves they claim to be.
      expect(ddl.statements.slice(drizzleCount)).toEqual(SIDECARS);

      // drizzle-kit renders one command per entry, so splitting them is
      // identity — a rendered entry that suddenly carried two would mean the
      // apply path had been sending multi-command strings unnoticed.
      const drizzleSplits = ddl.statements
        .slice(0, drizzleCount)
        .map((statement) => splitStatements(statement).length);
      expect(drizzleSplits.filter((count) => count !== 1)).toEqual([]);

      // The sidecars are hand-written scripts, and at least one is the reason
      // this module exists.
      const sidecarSplits = SIDECARS.map(
        (sidecar) => splitStatements(sidecar).length,
      );
      expect(sidecarSplits.every((count) => count >= 1)).toBe(true);
      expect(Math.max(...sidecarSplits)).toBeGreaterThan(1);

      // And at least one of them holds a semicolon that is not a terminator —
      // otherwise this case would pass against a `script.split(';')`, which
      // is precisely the thing the sidecars cannot be applied with.
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

/**
 * Every schema object the DDL creates, in one schema, as sorted text. Compared
 * between two schemas built by the two paths, so a statement the splitter lost
 * or truncated shows up as a missing function, trigger, policy or index rather
 * than as a table that happens to exist.
 */
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
  /**
   * The reference: the whole DDL string in one simple query. That is the one
   * path `@effect/sql-pg` does not have, so it is sent on node-postgres, into a
   * sibling of the scratch schema named so a crashed run's sweep reclaims it.
   */
  let whole: { client: pg.Client; schema: string } | undefined;
  /** `TestDatabaseLive`'s schema, applied one split statement at a time. */
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

    // Not a vacuous comparison: two empty schemas would also be equal.
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
          // The refusal this module exists for, observed rather than quoted:
          // `@effect/sql-pg` runs every statement through Parse/Bind/Execute,
          // which refuses a multi-command string.
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
        // The corpus this module exists for: the queue's DDL carries a
        // dollar-quoted plpgsql trigger body full of semicolons, and every
        // statement of it has to reach the server through the driver's only
        // path. Installed into a sibling of the scratch schema rather than
        // into `studio_jobs`, so the run cannot touch the developer's own
        // queue.
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

        // The trigger function is what a cut through a plpgsql body would
        // have cost: the tables would still be there, and nothing would wake
        // a worker.
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
