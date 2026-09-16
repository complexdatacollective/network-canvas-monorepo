import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JOB_SCHEMA, jobGrantsSql } from '@codaco/studio-sync/jobs';

import { renderSchemaDdl } from '../../../scripts/render-schema-ddl.ts';
import {
  createScratchSchema,
  reachableDb,
  type ScratchSchema,
  sqlState,
} from '../../__tests__/support/postgres.ts';
import { scratchSchemaDdl } from '../../__tests__/support/schema-ddl.ts';
import { JOB_SCHEMA_VERSION, renderJobStatements } from '../../jobs/queues.ts';
import { SIDECARS } from '../schema.ts';
import { splitStatements } from '../statements.ts';

// The scanner is proved twice: on scripts written here, where the awkward case
// is visible in the test, and on the three corpora Studio actually applies —
// where a cut in the wrong place is a syntax error at deployment time rather
// than a failing unit case.

const db = await reachableDb();

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

  it('reads a positional parameter as ordinary text', () => {
    // `$1` is not a dollar-quote opener; treating it as one would swallow the
    // rest of the script into a string that never closes.
    const script = `select ${JOB_SCHEMA}.create_queue($1, $2::jsonb);`;
    expect(splitStatements(script)).toEqual([
      `select ${JOB_SCHEMA}.create_queue($1, $2::jsonb)`,
    ]);
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
    const grants = splitStatements(jobGrantsSql(JOB_SCHEMA));

    expect(grants).toHaveLength(7);
    expect(grants.every((statement) => statement.startsWith('GRANT'))).toBe(
      true,
    );
    // One line each and in the declared order, checked against the source's
    // own lines: the grants are single-line by construction, so a splitter
    // that merged two or dropped one shows up here as a different list.
    expect(grants).toEqual(
      jobGrantsSql(JOB_SCHEMA)
        .split('\n')
        .map((line) => line.replace(/;$/, '')),
    );
    expect(grants[0]).toMatch(
      new RegExp(`^GRANT USAGE ON SCHEMA ${JOB_SCHEMA} TO `),
    );
  });

  it("cuts pg-boss's construction plan into its own commands", () => {
    // Observed on pg-boss 12.31.1, whose plan is schema version 41. An upgrade
    // that changes the plan changes this number, and the schema fingerprint
    // beside it — which is the point at which someone looks at both.
    const PLAN_STATEMENTS = 43;

    const [plan] = renderJobStatements();
    const statements = splitStatements(plan!);

    expect(statements).toHaveLength(PLAN_STATEMENTS);
    // The plan's own transaction control, which src/jobs/install.ts strips.
    expect(statements[0]).toBe('BEGIN');
    expect(statements.at(-1)).toBe('COMMIT');
    expect(statements.every((statement) => statement.length > 0)).toBe(true);

    // The version stamp is the last thing the plan writes, and `installJobSchema`
    // reads it back to decide whether this schema is the one this build ships.
    expect(statements.at(-2)).toBe(
      `INSERT INTO ${JOB_SCHEMA}.version(version) VALUES ('${JOB_SCHEMA_VERSION}')`,
    );

    // The two constructs a naive split gets wrong, both present here: a
    // plpgsql body full of semicolons, and DDL passed as a `$cmd$`-tagged
    // string to a function.
    const createQueue = statements.filter((statement) =>
      statement.startsWith(`CREATE FUNCTION ${JOB_SCHEMA}.create_queue(`),
    );
    expect(createQueue).toHaveLength(1);
    expect((createQueue[0]!.match(/;/g) ?? []).length).toBeGreaterThan(20);
    const tagged = statements.filter((statement) =>
      statement.startsWith(`SELECT ${JOB_SCHEMA}.job_table_run($cmd$`),
    );
    expect(tagged).toHaveLength(14);
    expect(
      tagged.every(
        (statement) =>
          (statement.match(/\$cmd\$/g) ?? []).length === 2 &&
          statement.endsWith(`, 'job_common')`),
      ),
    ).toBe(true);
    // And fourteen more `$cmd$` pairs sit inside create_queue's own `$$`
    // body, where they are text: a tag is closed by its own tag alone.
    expect((createQueue[0]!.match(/\$cmd\$/g) ?? []).length).toBe(28);
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
async function catalogue(pool: pg.Pool, schema: string) {
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

let preparedCount = 0;

/**
 * Runs one statement through Parse/Bind/Execute — the only path
 * `@effect/sql-pg` has, and the one that refuses a multi-command string.
 *
 * Naming the statement is what selects that path: node-pg sends an unnamed
 * query on the simple-query protocol, which takes a whole script happily, and
 * an empty `values` array does not change that. Every execution below would
 * otherwise pass whether or not the splitter had cut anything.
 */
async function prepare(
  connection: pg.Pool | pg.PoolClient,
  text: string,
): Promise<pg.QueryResult> {
  preparedCount += 1;
  return connection.query({ text, name: `split_statements_${preparedCount}` });
}

async function schemaNameOf(pool: pg.Pool): Promise<string> {
  const current = await pool.query<{ schema: string }>(
    'select current_schema() as schema',
  );
  return current.rows[0]!.schema;
}

describe.skipIf(!db)('splitStatements against Postgres', () => {
  /** Provisioned by executing the whole DDL string in one query. */
  let whole: ScratchSchema;
  /** Provisioned by executing the split statements, one query each. */
  let split: ScratchSchema;
  /** pg-boss's schema, installed statement by statement beside `split`. */
  let jobSchema: string;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    whole = await createScratchSchema(db);
    split = await createScratchSchema(db);
    jobSchema = `${split.jobSchema}_split`;

    const ddl = await scratchSchemaDdl();
    await whole.pool.query(ddl);
    for (const statement of splitStatements(ddl)) {
      await split.pool.query(statement);
    }
  }, RENDER_TIMEOUT_MS);

  afterAll(async () => {
    await split.pool
      .query(`drop schema if exists "${jobSchema}" cascade`)
      .catch(() => undefined);
    await whole.dispose().catch(() => undefined);
    await split.dispose().catch(() => undefined);
  });

  it('builds the same schema as executing the whole script', async () => {
    const expected = await catalogue(
      whole.pool,
      await schemaNameOf(whole.pool),
    );
    const actual = await catalogue(split.pool, await schemaNameOf(split.pool));

    // Not a vacuous comparison: two empty schemas would also be equal.
    expect(expected.tables.length).toBeGreaterThan(0);
    expect(expected.functions.length).toBeGreaterThan(0);
    expect(expected.triggers.length).toBeGreaterThan(0);
    expect(expected.policies.length).toBeGreaterThan(0);
    expect(expected.indexes.length).toBeGreaterThan(0);

    expect(actual).toEqual(expected);
  });

  it('cuts a multi-command string into commands a prepared statement accepts', async () => {
    // The refusal this module exists for, observed rather than quoted.
    const script = 'select 1 as a; select 2 as b';
    const refused = await prepare(whole.pool, script).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(sqlState(refused)).toBe('42601');

    const [first, second] = splitStatements(script);
    expect((await prepare(whole.pool, first!)).rows).toEqual([{ a: 1 }]);
    expect((await prepare(whole.pool, second!)).rows).toEqual([{ b: 2 }]);
  });

  it("installs pg-boss's plan one statement at a time", async () => {
    const [plan] = renderJobStatements();
    // The plan is rendered for JOB_SCHEMA; this installs a sibling of the
    // scratch schema instead, so the run cannot touch the developer's own
    // pgboss schema. Every occurrence of the name in the plan is a reference
    // to the schema it installs — including the advisory-lock key it hashes.
    const retargeted = plan!.replaceAll(JOB_SCHEMA, jobSchema);
    const statements = splitStatements(retargeted).filter(
      (statement) => statement !== 'BEGIN' && statement !== 'COMMIT',
    );

    // The plan's own BEGIN…COMMIT is dropped and the transaction is the
    // caller's, exactly as src/jobs/install.ts does it and for the reason
    // documented there: run as-is inside an open transaction, that COMMIT
    // commits the caller's.
    expect(statements).toHaveLength(splitStatements(retargeted).length - 2);

    const client = await split.pool.connect();
    try {
      await client.query('begin');
      for (const statement of statements) {
        await prepare(client, statement);
      }
      // The grants belong to the same install, and this is the only place
      // they reach a server rather than a string comparison.
      for (const grant of splitStatements(jobGrantsSql(jobSchema))) {
        await prepare(client, grant);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const version = await split.pool.query<{ version: number }>(
      `select version from "${jobSchema}".version`,
    );
    expect(version.rows[0]?.version).toBe(JOB_SCHEMA_VERSION);

    // The functions are what a cut through a plpgsql body would have cost:
    // the tables would still be there, and nothing could queue a job.
    const functions = await split.pool.query<{ count: number }>(
      `select count(*)::int as count
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = $1`,
      [jobSchema],
    );
    expect(functions.rows[0]!.count).toBeGreaterThan(0);
  });
});
