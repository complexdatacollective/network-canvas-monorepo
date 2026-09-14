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
  /** The web process's enqueue-only pg-boss, on the application pool. */
  createJobClient: () => Promise<JobClient>;
  /**
   * A worker pinned to the maintenance role, on this scratch job schema, with
   * every background cadence turned down so a test observes a pass rather than
   * waiting one out. Started and stopped by the caller; `dispose` stops
   * whatever a failing case left running.
   */
  createJobWorker: (overrides?: Partial<JobWorkerDeps>) => JobWorker;
  dispose: () => Promise<void>;
};

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
    createJobClient: async () => {
      const client = await createJobClient(app, { schema: jobSchema });
      running.push(client);
      return client;
    },
    createJobWorker: (overrides = {}) => {
      const worker = createJobWorker({
        db,
        maintenancePool: maintenance,
        publicBaseUrl: 'http://localhost:3000',
        schema: jobSchema,
        intervals: SCRATCH_WORKER_INTERVALS,
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
