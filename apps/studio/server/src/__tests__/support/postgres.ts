import { randomUUID } from 'node:crypto';

import { Context, Effect, Exit, Layer, Logger, Scope } from 'effect';
import pg from 'pg';
import { getConstructionPlans, type PgBoss } from 'pg-boss';

import { jobGrantsSql } from '@codaco/studio-sync/jobs';
import { TENANT_ROLES, TENANT_ROLES_SQL } from '@codaco/studio-sync/rls';

import { DatabasePool } from '../../db/database-pool.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { createOwnerPool } from '../../db/pool.ts';
import { stampFingerprint } from '../../db/schema.ts';
import {
  type DbEnv,
  Environment,
  isLocalDatabase,
  readEnv,
  type StudioEnv,
} from '../../env.ts';
import { createJobClient, type JobClient } from '../../jobs/client.ts';
import { installNativeJobSchema } from '../../jobs/effect/install.ts';
import { jobQueueDefinitions } from '../../jobs/queues.ts';
import { JobHandlersLive } from '../../jobs/registrations.ts';
import { JobWorker, type JobWorkerConfig } from '../../jobs/worker.ts';
import { MailFailed, Mailer, type StudioMailer } from '../../mail/mailer.ts';
import { SchemaStatus } from '../../platform/schema-gate.ts';
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
 * pg-boss installs into a schema of its own rather than the one under test, so
 * every scratch schema gets a sibling. Named from the scratch schema so the
 * `studio_test_%` sweep in scripts/apply.ts reclaims both after a crashed run.
 */
function jobSchemaFor(schema: string): string {
  return `${schema}_jobs`;
}

/**
 * The Effect-native queue's sibling, beside pg-boss's (#1927). Named from the
 * scratch schema for the same reason, and named after the production schema
 * (`studio_jobs`) so that a suite reading the name can see which of the two
 * queues it is looking at.
 */
function nativeJobSchemaFor(schema: string): string {
  return `${schema}_studio_jobs`;
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
   * This scratch schema's Effect-native job schema, once provisioned — what a
   * suite builds a `Database` against to drive the queue of #1927.
   */
  nativeJobSchema: string;
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
  createJobWorker: (overrides?: ScratchJobWorkerOverrides) => ScratchJobWorker;
  dispose: () => Promise<void>;
};

/**
 * What a suite varies about a scratch worker. The rest of the environment the
 * worker layers read is fixed below, because a test that changed it would be
 * testing a deployment this build cannot have.
 */
export type ScratchJobWorkerOverrides = {
  /**
   * Absent means no transport is configured, which is the `refuse` environment
   * a worker reads when SMTP_URL is unset: the mail queues go unworked.
   */
  mailer?: StudioMailer;
  /** The browser-facing origin the invitation handler mints links against. */
  publicBaseUrl?: string;
  /**
   * What the registered handlers poll at. A suite that has to prove delivery
   * came from LISTEN/NOTIFY rather than from a poll turns it up so that polling
   * could not have been what delivered the job.
   */
  workPollingIntervalSeconds?: number;
};

/**
 * The Promise-shaped handle the job suites drive. The worker is a layer now
 * (src/jobs/worker.ts, src/jobs/registrations.ts); `start` builds it into a
 * scope of this handle's own and `stop` closes that scope, which is what runs
 * pg-boss's graceful shutdown.
 */
export type ScratchJobWorker = {
  /** The instance, for cases that observe pg-boss rather than drive it. */
  readonly boss: PgBoss;
  /** What pg-boss was constructed with; pg-boss keeps its own copy private. */
  readonly config: JobWorkerConfig;
  start: () => Promise<void>;
  stop: () => Promise<void>;
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
 * The suites read what a worker says through `console.log`/`console.error`
 * spies, because that is where the lines the handlers themselves write land. A
 * deployment renders one JSON object per line instead (src/platform/logger.ts),
 * which would put the message in a field rather than in the first argument, so
 * the scratch stack logs the message alone and leaves the level to the console
 * method — `Effect.logError` to `console.error`, everything else to its own.
 */
const scratchLogger = Logger.withLeveledConsole(
  Logger.make(({ message }: Logger.Options<unknown>) =>
    (Array.isArray(message) ? message : [message]).map(String).join(' '),
  ),
);

/**
 * The environment a scratch worker's layers read. Fixed apart from the three
 * things a suite varies, and deliberately without a rate-limit store: the
 * committed `.env.development` this suite runs under has one, and a worker that
 * picked it up would open a Valkey connection per case.
 */
function scratchWorkerEnv(
  db: DbEnv,
  overrides: ScratchJobWorkerOverrides,
): StudioEnv {
  return {
    port: 3000,
    host: '127.0.0.1',
    workerHealthPort: 3001,
    s3: undefined,
    db,
    auth: {
      secret: 'scratch-worker-signing-secret',
      baseUrl: overrides.publicBaseUrl ?? 'http://localhost:3000',
      trustedProxies: undefined,
      socialProviders: {},
    },
    // What `resolve` produces for a worker with and without SMTP_URL set: the
    // transport itself is provided as the Mailer layer below, and this is what
    // the registrations read to decide whether to work the mail queues.
    mail: overrides.mailer ? { kind: 'console' } : { kind: 'refuse' },
    secrets: undefined,
    redis: undefined,
    trustedProxies: undefined,
    devDefaults: true,
    telemetry: false,
    telemetryEndpoint: undefined,
    deploymentMode: 'self-hosted',
    seedAdminPassword: undefined,
  };
}

/** A suite's Promise-shaped transport, seen as the service the layers take. */
function mailerLayer(mailer: StudioMailer | undefined): Layer.Layer<Mailer> {
  if (!mailer) return Mailer.layerRefuse;
  return Layer.succeed(
    Mailer,
    Mailer.of({
      sendMagicLink: (input) =>
        Effect.tryPromise({
          try: () => mailer.sendMagicLink(input),
          catch: (cause) => new MailFailed({ cause }),
        }),
      sendTeamInvitation: (input) =>
        Effect.tryPromise({
          try: () => mailer.sendTeamInvitation(input),
          catch: (cause) => new MailFailed({ cause }),
        }),
    }),
  );
}

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
  const nativeJobSchema = nativeJobSchemaFor(name);

  // A pg-boss instance polls on a timer, so one left running would keep
  // querying a schema the drop below has removed — and its `error` listener
  // would report that as a test failure in whichever file ran next.
  const running: { stop: () => Promise<void> }[] = [];

  return {
    pool,
    app,
    maintenance,
    jobSchema,
    nativeJobSchema,
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
      // The deployment's composition with only the schema, the cadences and the
      // stop window changed: the registrations over the worker, both provided
      // the environment, the schema verdict, the maintenance pool and the
      // transport a suite handed in.
      const layer = JobHandlersLive({
        workPollingIntervalSeconds: overrides.workPollingIntervalSeconds,
      }).pipe(
        Layer.provideMerge(
          JobWorker.layerPgBoss({
            schema: jobSchema,
            intervals: SCRATCH_WORKER_INTERVALS,
            stopTimeoutMs: SCRATCH_STOP_TIMEOUT_MS,
          }),
        ),
        Layer.provide([
          Layer.succeed(Environment, scratchWorkerEnv(db, overrides)),
          // The suites provision the schema themselves, so there is nothing to
          // wait for; what the gate does with a stale one is its own suite's.
          SchemaStatus.layerCurrent,
          Layer.succeed(DatabasePool, {
            identity: 'maintenance',
            pool: maintenance,
          }),
          mailerLayer(overrides.mailer),
          Logger.layer([scratchLogger]),
        ]),
      );

      let scope: Scope.Closeable | undefined;
      let built: Context.Context<JobWorker> | undefined;
      let starting: Promise<void> | undefined;
      let stopping: Promise<void> | undefined;

      const service = (): JobWorker['Service'] => {
        if (!built) {
          throw new Error(
            'this scratch worker has not been started: call start() before reading boss or config',
          );
        }
        return Context.get(built, JobWorker);
      };

      const worker: ScratchJobWorker = {
        get boss() {
          return service().boss;
        },
        get config() {
          return service().config;
        },
        start: () => {
          starting ??= (async () => {
            const opened = Effect.runSync(Scope.make());
            scope = opened;
            try {
              built = await Effect.runPromise(
                Layer.buildWithScope(layer, opened),
              );
            } catch (error) {
              // A build that failed part-way still acquired whatever came
              // before it — pg-boss's own pool among them.
              await Effect.runPromise(Scope.close(opened, Exit.void));
              scope = undefined;
              throw error;
            }
          })();
          return starting;
        },
        // Closing the scope is what runs pg-boss's graceful stop. Memoised
        // because a scope closes once, and `dispose()` stops whatever a failing
        // case left running — possibly after the case stopped it itself.
        stop: () => {
          stopping ??= (async () => {
            const opened = scope;
            if (!opened) return;
            await Effect.runPromise(Scope.close(opened, Exit.void));
          })();
          return stopping;
        },
      };
      running.push(worker);
      return worker;
    },
    dispose: async () => {
      await Promise.allSettled(running.map((instance) => instance.stop()));
      await Promise.all([app.end(), maintenance.end(), pool.end()]);
      const cleanup = createOwnerPool(db);
      try {
        await cleanup.query(`drop schema if exists "${jobSchema}" cascade`);
        await cleanup.query(
          `drop schema if exists "${nativeJobSchema}" cascade`,
        );
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
  await provisionScratchNativeJobSchema(pool, nativeJobSchemaFor(schema));
}

/**
 * The Effect-native queue's schema, in a second sibling — everything a schema
 * application installs outside `public`, so a scratch schema is the same shape
 * as a deployed database (#1927). Through the very function `applySchema` and
 * `studio-api migrate` call, so the suites cannot be provisioned by a
 * different set of statements from the one a deployment gets.
 *
 * On a client of its own rather than the pool, because `installNativeJobSchema`
 * applies the DDL one statement at a time and must not have them land on
 * different connections.
 */
async function provisionScratchNativeJobSchema(
  pool: pg.Pool,
  schema: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await installNativeJobSchema(client, schema);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * pg-boss's half of what `applySchema` installs, against this scratch schema's
 * sibling. The schema name is derived from `current_schema()` by the caller
 * rather than passed in from a suite, so the forty or so suites that provision
 * a scratch schema all get a working queue without naming one.
 *
 * Queues are created through pg-boss's own plpgsql function — one statement
 * each, and the same one `createQueue` runs — rather than by starting a
 * PgBoss instance per scratch schema, which would cost a connection and a
 * round of queue-cache reads for something every suite pays for.
 */
async function provisionScratchJobSchema(
  pool: pg.Pool,
  schema: string,
): Promise<void> {
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
