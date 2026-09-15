import { randomUUID } from 'node:crypto';
import process from 'node:process';

import pg from 'pg';
import { getConstructionPlans } from 'pg-boss';

import { jobGrantsSql } from '@codaco/studio-sync/jobs';
import { TENANT_ROLES, TENANT_ROLES_SQL } from '@codaco/studio-sync/rls';

import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { createOwnerPool } from '../../db/pool.ts';
import { stampFingerprint } from '../../db/schema.ts';
import { type DbEnv, isLocalDatabase, readEnv } from '../../env.ts';
import { createJobClient, type JobClient } from '../../jobs/client.ts';
import { jobQueueDefinitions } from '../../jobs/queues.ts';
import {
  createJobWorker,
  type JobWorker,
  type JobWorkerDeps,
} from '../../jobs/worker.ts';
import { scratchSchemaDdl } from './schema-ddl.ts';

const PROBE_TIMEOUT_MS = 3000;

/* oxlint-disable-next-line node/no-process-env -- the boundary for this flag */
const CI = process.env.CI === 'true';

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
 * pg-boss installs into a schema of its own rather than the one under test, so
 * every scratch schema gets a sibling. Named from the scratch schema so the
 * `studio_test_%` sweep in scripts/apply.ts reclaims both after a crashed run.
 */
function jobSchemaFor(schema: string): string {
  return `${schema}_jobs`;
}

export type ScratchSchema = {
  /** The connecting login: provisioning, fixtures, and cross-team oracles. */
  pool: pg.Pool;
  /** What the server runs as, with row-level security enforced. */
  app: pg.Pool;
  /** What garbage collection runs as. */
  maintenance: pg.Pool;
  /** This scratch schema's pg-boss schema, once provisioned. */
  jobSchema: string;
  /**
   * The web process's enqueue-only pg-boss, against this scratch job schema
   * and on a pool of its own pinned to the application role — the production
   * construction, with only the schema changed.
   *
   * Started by default, because a case that enqueues wants the connection
   * failure of a broken client at its `beforeAll` rather than inside its
   * first assertion. `{ start: false }` leaves the queue cache cold, which is
   * what the lazy start and the cold-cache enqueue are about.
   */
  createJobClient: (options?: { start?: boolean }) => Promise<JobClient>;
  /**
   * A worker pinned to the maintenance role, on this scratch job schema, with
   * every background cadence turned down so a test observes a pass rather than
   * waiting one out. Started and stopped by the caller; `dispose` stops
   * whatever a failing case left running.
   */
  createJobWorker: (overrides?: Partial<JobWorkerDeps>) => JobWorker;
  dispose: () => Promise<void>;
};

/**
 * The graceful window a scratch worker's `stop()` waits out. Production gives
 * a handler 25 seconds, which is most of a container's stop window and nearly
 * all of this suite's 30-second hook timeout: a case whose handler is
 * deliberately slow, or one that fails while a job is in flight, would have
 * `dispose()` sit out the whole window and fail the file at its teardown
 * rather than at the assertion that went wrong.
 */
const SCRATCH_STOP_TIMEOUT_MS = 2000;

// Enough that pg-boss's own polling floor (500ms) is what a test waits on.
const SCRATCH_WORKER_INTERVALS = {
  superviseIntervalSeconds: 1,
  maintenanceIntervalSeconds: 1,
  monitorIntervalSeconds: 1,
  queueCacheIntervalSeconds: 1,
  cronMonitorIntervalSeconds: 1,
  cronWorkerIntervalSeconds: 1,
  clockMonitorIntervalSeconds: 1,
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

  // A pg-boss instance polls on a timer, so one left running would keep
  // querying a schema the drop below has removed — and its `error` listener
  // would report that as a test failure in whichever file ran next.
  const running: { stop: () => Promise<void> }[] = [];

  return {
    pool,
    app,
    maintenance,
    jobSchema,
    createJobClient: async ({ start = true } = {}) => {
      // The client builds its own application-role pool from `db`; the search
      // path the scratch pools carry is not one of its concerns, because every
      // statement it runs names its schema.
      const client = createJobClient(db, { schema: jobSchema });
      running.push(client);
      if (start) await client.start();
      return client;
    },
    createJobWorker: (overrides = {}) => {
      const worker = createJobWorker({
        db,
        maintenancePool: maintenance,
        publicBaseUrl: 'http://localhost:3000',
        schema: jobSchema,
        intervals: SCRATCH_WORKER_INTERVALS,
        stopTimeoutMs: SCRATCH_STOP_TIMEOUT_MS,
        ...overrides,
      });
      running.push(worker);
      return worker;
    },
    dispose: async () => {
      await Promise.allSettled(running.map((instance) => instance.stop()));
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
  await provisionScratchJobSchema(pool);
}

/**
 * pg-boss's half of what `applySchema` installs, against this scratch schema's
 * sibling. Derived from `current_schema()` rather than passed in, so the forty
 * or so suites that provision a scratch schema all get a working queue without
 * naming one.
 *
 * Queues are created through pg-boss's own plpgsql function — one statement
 * each, and the same one `createQueue` runs — rather than by starting a
 * PgBoss instance per scratch schema, which would cost a connection and a
 * round of queue-cache reads for something every suite pays for.
 */
async function provisionScratchJobSchema(pool: pg.Pool): Promise<void> {
  const current = await pool.query<{ schema: string }>(
    'select current_schema() as schema',
  );
  const schema = jobSchemaFor(current.rows[0]!.schema);

  await pool.query(getConstructionPlans(schema));
  await pool.query(jobGrantsSql(schema));
  for (const { name, options } of jobQueueDefinitions()) {
    await pool.query(`select ${schema}.create_queue($1, $2::jsonb)`, [
      name,
      JSON.stringify({ policy: 'standard', ...options }),
    ]);
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
 * The SQLSTATE a failure carries, wherever it ended up. Drizzle wraps a driver
 * error, so the code can be a cause or two down, and pg-boss re-emits one from
 * a worker as a plain object rather than an Error. Read through the chain
 * rather than off the top: a missing `code` would otherwise read the same as a
 * privilege error that never happened.
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
