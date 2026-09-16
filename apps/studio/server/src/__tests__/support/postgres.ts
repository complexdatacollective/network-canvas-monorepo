import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { TENANT_ROLES, TENANT_ROLES_SQL } from '@codaco/studio-sync/rls';

import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { createOwnerPool } from '../../db/pool.ts';
import { stampFingerprint } from '../../db/schema.ts';
import { type DbEnv, isLocalDatabase, readEnv } from '../../env.ts';
import { createJobClient, type JobClient } from '../../jobs/client.ts';
import { installJobSchema } from '../../jobs/install.ts';
import { CI } from './env.ts';
import { scratchSchemaDdl } from './schema-ddl.ts';

const PROBE_TIMEOUT_MS = 3000;

function unavailable(reason: string): null {
  if (CI) throw new Error(`the Studio database suites cannot run: ${reason}`);
  return null;
}

export async function reachableDb(): Promise<DbEnv | null> {
  const { db } = readEnv();
  // Local only, the same refusal scripts/db-reset.ts makes: these suites run
  // garbage collection's unqualified DELETEs.
  if (!db) return unavailable('DATABASE_URL is not set');
  if (!isLocalDatabase(db.url)) {
    return unavailable(`${db.url} is not a local database`);
  }
  const pool = createOwnerPool(db);
  let timer: NodeJS.Timeout | undefined;
  try {
    // The application pools pin roles the schema apply creates; provisioning
    // them here means no suite depends on another having run first.
    const probe = pool.query(TENANT_ROLES_SQL);
    // When the timeout wins the race, this query is still in flight and
    // `pool.end()` below rejects it. Promise.race has already settled by then,
    // so nothing is listening — and an unhandled rejection fails the run.
    probe.catch(() => undefined);
    await Promise.race([
      probe,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('probe timeout')),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    return db;
  } catch (err) {
    return unavailable(`${db.url} is unreachable (${String(err)})`);
  } finally {
    // Otherwise the timer keeps the suite alive for the rest of its window.
    clearTimeout(timer);
    await pool.end();
  }
}

/**
 * The job queue installs into a schema of its own rather than the one under
 * test, so every scratch schema gets a sibling. Named from the scratch schema
 * so the `studio_test_%` sweep in scripts/apply.ts reclaims it after a crashed
 * run, and after the production schema (`studio_jobs`) so a suite reading the
 * name can see what it is looking at.
 */
function jobSchemaFor(schema: string): string {
  return `${schema}_studio_jobs`;
}

export type ScratchSchema = {
  /** The connecting login: provisioning, fixtures, and cross-team oracles. */
  pool: pg.Pool;
  /** What the server runs as, with row-level security enforced. */
  app: pg.Pool;
  /** What garbage collection runs as. */
  maintenance: pg.Pool;
  /** This scratch schema's job schema, once provisioned. */
  jobSchema: string;
  /**
   * The web process's enqueue-only job client, against this scratch job
   * schema — the production construction with only the schema changed. It
   * holds no pool and opens no connection, so there is nothing to start and
   * nothing to stop; it is `async` only so the suites that build one in a
   * `beforeAll` need not change shape.
   */
  createJobClient: () => Promise<JobClient>;
  dispose: () => Promise<void>;
};

/**
 * An isolated Postgres schema with its own pools. Suites that write a
 * deliberately wrong fingerprint need this: doing that in the shared
 * `studio_dev` would leave the developer's next `pnpm dev` refusing to boot.
 * Every statement in the composed schema is unqualified — tables, plpgsql
 * functions, and the triggers that bind to them — so all of it lands here.
 */
export async function createScratchSchema(db: DbEnv): Promise<ScratchSchema> {
  const name = `studio_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  const admin = createOwnerPool(db);
  try {
    await admin.query(`create schema "${name}"`);
  } finally {
    await admin.end();
  }

  // Not the server's constructors: the search_path is the whole point, and
  // the server's pools deliberately never carry one.
  // The timeout turns a leaked client into a fast failure rather than a hang.
  const connect = (role?: string) =>
    new pg.Pool({
      connectionString: db.url,
      options: `-c search_path=${name}${role === undefined ? '' : ` -c role=${role}`}`,
      max: 20,
      connectionTimeoutMillis: 10_000,
    });
  const pool = connect();
  const app = connect(TENANT_ROLES.app);
  const maintenance = connect(TENANT_ROLES.maintenance);
  const jobSchema = jobSchemaFor(name);

  return {
    pool,
    app,
    maintenance,
    jobSchema,
    createJobClient: () =>
      // The search path the scratch pools carry is not the client's concern:
      // every statement it runs names its schema, and it runs them on the
      // connection its caller hands it.
      Promise.resolve(createJobClient({ schema: jobSchema })),
    dispose: async () => {
      await Promise.all([app.end(), maintenance.end(), pool.end()]);
      const cleanup = createOwnerPool(db);
      try {
        await cleanup.query(`drop schema if exists "${jobSchema}" cascade`);
        await cleanup.query(`drop schema if exists "${name}" cascade`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

/**
 * Builds the schema from the same statements scripts/apply.ts pushes; push
 * itself cannot target a scratch schema (it introspects `public`), so the
 * push path is exercised by the scratch-database suite instead. Takes the
 * owner pool: the statements are DDL.
 *
 * The statements arrive through `scratchSchemaDdl()`, which serves them from
 * a fingerprint-addressed cache rather than re-rendering them — identical
 * bytes, without drizzle-kit in this file's module graph.
 */
export async function provisionScratchSchema(pool: pg.Pool): Promise<void> {
  await pool.query(await scratchSchemaDdl());
  await stampFingerprint(pool, SCHEMA_FINGERPRINT);
  const current = await pool.query<{ schema: string }>(
    'select current_schema() as schema',
  );
  const schema = current.rows[0]!.schema;
  await provisionScratchJobSchema(pool, jobSchemaFor(schema));
}

/**
 * The job queue's schema, in a sibling — everything a schema application
 * installs outside `public`, so a scratch schema is the same shape as a
 * deployed database (#1927). Through the very function `applySchema` and
 * `studio-api migrate` call, so the suites cannot be provisioned by a
 * different set of statements from the one a deployment gets.
 *
 * On a client of its own rather than the pool, because `installJobSchema`
 * applies the DDL one statement at a time and must not have them land on
 * different connections.
 */
async function provisionScratchJobSchema(
  pool: pg.Pool,
  schema: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await installJobSchema(client, schema);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Every row of every table in one schema, rendered as text and sorted within
 * each table — so two dumps of the same data compare equal whatever order
 * Postgres hands rows back in, and a search over one covers everything stored.
 *
 * Driven off `pg_tables` rather than a list, for the reason the seed's own
 * wipe is: a table added later has to be in the dump without anyone
 * remembering to add it. Rows are rendered through `to_jsonb` so a column can
 * be left out (`omitColumns`) — `t::text` cannot express that, and one column
 * in the whole model is deliberately not reproducible.
 *
 * @param schema defaults to the pool's own `current_schema()`.
 */
export async function dumpSchemaRows(
  pool: pg.Pool,
  options: {
    schema?: string;
    omitColumns?: Readonly<Record<string, readonly string[]>>;
  } = {},
): Promise<Map<string, string[]>> {
  const schema =
    options.schema ??
    (await pool.query<{ schema: string }>('select current_schema() as schema'))
      .rows[0]!.schema;

  const tables = await pool.query<{ name: string }>(
    `select tablename as name from pg_tables where schemaname = $1 order by 1`,
    [schema],
  );

  const dump = new Map<string, string[]>();
  for (const { name } of tables.rows) {
    const rows = await pool.query<{ row: string }>(
      `select (to_jsonb(t) - $1::text[])::text as row
         from ${pg.escapeIdentifier(schema)}.${pg.escapeIdentifier(name)} t
        order by 1`,
      [[...(options.omitColumns?.[name] ?? [])]],
    );
    dump.set(
      name,
      rows.rows.map((row) => row.row),
    );
  }
  return dump;
}

/**
 * The SQLSTATE a failure carries, wherever it ended up. Drizzle and
 * `@effect/sql-pg` both wrap a driver error, so the code can be a cause or two
 * down. Read through the chain rather than off the top: a missing `code` would
 * otherwise read the same as a privilege error that never happened.
 */
export function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if ('code' in current && typeof current.code === 'string') {
      return current.code;
    }
    if (!('cause' in current)) return undefined;
    current = current.cause;
  }
  return undefined;
}

/**
 * A team id no other run reuses.
 *
 * The audit denial window counts in Valkey and outlives the process (#1909),
 * keyed by (actor, team, operation). A fixture that reuses a fixed team id
 * across runs inside that window therefore starts with part of its allowance
 * already spent, and a case that expects a denial event gets a suppressed
 * attempt instead. Every run gets a scratch schema for the same reason; this
 * is the same rule applied to the other durable store.
 */
export function uniqueTeamId(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

export async function seedTeam(db: pg.Pool, teamId: string): Promise<void> {
  await db.query(
    `INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [teamId],
  );
}

/** Needs CREATEDB; a crashed run's leftovers are swept by db-reset. */
export async function createScratchDatabase(
  db: DbEnv,
): Promise<{ db: DbEnv; pool: pg.Pool; dispose: () => Promise<void> }> {
  const name = `studio_test_db_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  const admin = createOwnerPool(db);
  try {
    await admin.query(`create database ${pg.escapeIdentifier(name)}`);
  } finally {
    await admin.end();
  }

  const url = new URL(db.url);
  url.pathname = `/${name}`;
  const scratchDb = { url: url.toString() };
  const pool = createOwnerPool(scratchDb);

  return {
    db: scratchDb,
    pool,
    dispose: async () => {
      await pool.end();
      const cleanup = createOwnerPool(db);
      try {
        await cleanup.query(
          `drop database if exists ${pg.escapeIdentifier(name)} with (force)`,
        );
      } finally {
        await cleanup.end();
      }
    },
  };
}
