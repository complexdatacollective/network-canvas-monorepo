import { createHash } from 'node:crypto';

import {
  generateDrizzleJson,
  generateMigration,
  pushSchema,
} from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PgBoss } from 'pg-boss';

import { JOB_SCHEMA, jobGrantsSql } from '@codaco/studio-sync/jobs';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import {
  SCHEMA,
  SCHEMA_LOCK_KEY,
  SIDECARS,
  stampFingerprint,
} from '../src/db/schema.ts';
import { seed, type SeedOptions } from '../src/db/seed.ts';
import { jobDatabaseForPool } from '../src/jobs/database.ts';
import {
  JOB_SCHEMA_VERSION,
  jobQueueDefinitions,
  QUEUE_OPTION_DEFAULTS,
  renderJobStatements,
} from '../src/jobs/queues.ts';

// Kept out of src/ so drizzle-kit (and its esbuild binary) can never reach
// the server or Netlify bundles.

// Rendering the job statements needs pg-boss but not drizzle-kit, and the test
// support has to hash them without paying for drizzle-kit's module graph, so
// they are rendered in src/jobs/queues.ts and re-exported here — this file
// stays the one place that describes what a schema application consists of.
export { renderJobStatements };

let renderedDrizzleSchema: Promise<string[]> | undefined;

export function renderDrizzleSchemaStatements(): Promise<string[]> {
  renderedDrizzleSchema ??= (async () =>
    generateMigration(
      await generateDrizzleJson({}),
      await generateDrizzleJson(SCHEMA),
    ))();
  return renderedDrizzleSchema;
}

export async function renderSchemaStatements(): Promise<string[]> {
  return [...(await renderDrizzleSchemaStatements()), ...SIDECARS];
}

/**
 * The public schema and pg-boss's, hashed together: a pg-boss upgrade, a
 * change to the job grants and a change to a queue's retry or expiry are each
 * a schema change like any other, applied once here and refused at boot by
 * every process until they have been.
 *
 * `renderSchemaStatements` deliberately stays the public statements alone —
 * they are the DDL the suites execute into a scratch schema, and the job
 * statements name their own schema rather than running inside that one.
 */
export async function computeSchemaFingerprint(): Promise<string> {
  const statements = [
    ...(await renderSchemaStatements()),
    ...renderJobStatements(),
  ];
  return createHash('sha256').update(statements.join('\n')).digest('hex');
}

export type ApplyOutcome = {
  statements: string[];
  hints: { hint: string; statement?: string }[];
};

/**
 * Installs pg-boss's own schema, or replaces it when the installed version is
 * not the one this build ships.
 *
 * Replacement rather than migration is the pre-release posture the rest of
 * this file takes: drizzle-kit push reconciles the public schema in place and
 * Studio has no migration system yet, so pg-boss's migrations are not run
 * either. Dropping the schema discards whatever was queued, which is why the
 * count is logged — after release this becomes pg-boss's own migration call.
 */
async function installJobSchema(
  db: pg.Pool | pg.PoolClient,
  schema: string,
): Promise<void> {
  // Two statements rather than one guarded by `to_regclass`: a query naming a
  // relation that does not exist is refused when it is parsed, long before the
  // guard could decide not to read it.
  const installed = await db.query<{ present: boolean }>(
    `select to_regclass('${schema}.version') is not null as present`,
  );
  const present = installed.rows[0]?.present === true;
  // `null` where the schema is there but says nothing about its version: an
  // interrupted install, or a migration that emptied the table. It is not the
  // absent case — the tables and the enum are there, and re-running the
  // construction plan over them fails on `CREATE TYPE` (42710) — so it is
  // treated as the mismatch it is and the schema is replaced.
  const version = present
    ? ((
        await db.query<{ version: number }>(
          `select version from ${schema}.version`,
        )
      ).rows[0]?.version ?? null)
    : null;

  if (!present || version !== JOB_SCHEMA_VERSION) {
    if (present) {
      const queued = await db
        .query<{ count: string }>(`select count(*)::text from ${schema}.job`)
        .then((result) => result.rows[0]?.count ?? 'an unknown number of')
        // A shape this build cannot read is exactly the case the drop exists
        // for; not being able to count it is not a reason to refuse.
        .catch(() => 'an unknown number of');
      console.warn(
        `Replacing pg-boss schema ${schema} (version ${version ?? 'unknown'}) with version ${JOB_SCHEMA_VERSION}; ${queued} job(s) are discarded.`,
      );
      await db.query(`drop schema ${schema} cascade`);
    }
    await db.query(renderJobStatements()[0]!);
  }

  // Re-run on every apply, not only on install: a grant change moves the
  // fingerprint, and reaching here means the fingerprint matched this build.
  await db.query(jobGrantsSql(schema));
}

/**
 * Brings every declared queue into being, or up to date. A queue's options are
 * data in its row, so this is the queue equivalent of drizzle-kit's push: the
 * installed row is made to equal the declaration rather than to contain it.
 *
 * That equality is what `QUEUE_OPTION_DEFAULTS` is for. pg-boss's update
 * leaves an option it was not given alone, so an option dropped from a
 * declaration would otherwise keep the value the deployment before this one
 * applied — a queue quietly retrying seven times because it used to.
 */
async function syncJobQueues(pool: pg.Pool, schema: string): Promise<void> {
  const boss = new PgBoss({
    db: jobDatabaseForPool(pool),
    schema,
    migrate: false,
    supervise: false,
    schedule: false,
  });
  boss.on('error', (error) => {
    console.error('pg-boss error while reconciling queues:', error);
  });
  await boss.start();
  try {
    for (const { name, options } of jobQueueDefinitions()) {
      const existing = await boss.getQueue(name);
      if (!existing) {
        await boss.createQueue(name, options);
        continue;
      }
      // pg-boss refuses a policy change outright: the policy decides which
      // unique indexes the queue's jobs are held under, so an existing job
      // could not satisfy the new one. `partition` is refused for the same
      // reason and is declared nowhere, so it is dropped rather than checked.
      const {
        policy = 'standard',
        partition: _partition,
        ...declared
      } = options;
      if (existing.policy !== policy) {
        throw new Error(
          `queue ${name} is installed with policy ${existing.policy} and is now declared ${policy}; a policy cannot be changed after creation. Recreate the database: pnpm --filter @codaco/studio-server db:reset`,
        );
      }
      await boss.updateQueue(name, { ...QUEUE_OPTION_DEFAULTS, ...declared });
    }
  } finally {
    await boss.stop({ graceful: false });
  }
}

/**
 * Not transactional — a push failure partway leaves an unstamped database,
 * which checkSchema reports as stale and db:reset remedies.
 *
 * The pool needs at least two free connections: this holds one for the whole
 * apply (the advisory lock is session-scoped, so releasing it would release
 * the lock) while drizzle-kit's push and the queue reconciliation check out
 * their own. A single-connection pool deadlocks here until its connection
 * timeout, not at the first statement.
 */
export async function applySchema(pool: pg.Pool): Promise<ApplyOutcome> {
  const fingerprint = await computeSchemaFingerprint();
  if (fingerprint !== SCHEMA_FINGERPRINT) {
    throw new Error(
      'src/db/fingerprint.generated.ts does not match the schema definitions; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    );
  }

  const lock = await pool.connect();
  try {
    await lock.query(`select pg_advisory_lock(${SCHEMA_LOCK_KEY})`);
    // A matching stamp must not survive a failed apply: a drifted database
    // would keep reading `current`. Cleared here, restored only on success.
    const stamped = await lock.query<{ present: boolean }>(
      `select to_regclass('"schemaFingerprint"') is not null as present`,
    );
    if (stamped.rows[0]?.present) {
      await lock.query('delete from "schemaFingerprint"');
    }
    // Confined to `public`: without a schema filter, push introspects every
    // schema in the database and reconciles it against the Drizzle schema,
    // which now means dropping pg-boss's tables as unmanaged. `public` is the
    // only schema Studio itself declares.
    const push = await pushSchema(SCHEMA, drizzle({ client: pool }), {
      schemas: ['public'],
      tables: undefined,
      entities: undefined,
      extensions: undefined,
    });
    await push.apply();
    await lock.query(SIDECARS.join('\n'));
    // After the sidecars, because the grants name the roles the sync sidecar
    // creates, and before the stamp, because a stamped database has to be one
    // where a process can already enqueue.
    await installJobSchema(lock, JOB_SCHEMA);
    await syncJobQueues(pool, JOB_SCHEMA);
    await stampFingerprint(lock, fingerprint);
    return { statements: push.sqlStatements, hints: push.hints };
  } finally {
    await lock
      .query(`select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`)
      .catch(() => undefined);
    lock.release();
  }
}

export type ResetOptions = SeedOptions & {
  /**
   * Also drop every `studio_test_*` scratch schema and database on the
   * cluster. Only an explicit `db:reset` asks for this: the sweep is the
   * remedy for what a crashed test run left behind, but it cannot tell a
   * leftover from a suite that is running right now, and it force-drops
   * either. The automatic dev-boot reset therefore leaves them alone.
   */
  sweepScratch?: boolean;
};

/**
 * The full local reset: drop and recreate the schema, optionally sweep the
 * scratch schemas and databases a crashed test run left behind, reapply the
 * schema, and reseed. Shared by db-reset.ts (on demand) and dev-pg.ts (every
 * `pnpm dev` boot) so the two sequences cannot drift apart. Callers own the
 * non-local safety check — this function always does the drop.
 */
export async function resetSchemaAndSeed(
  pool: pg.Pool,
  options: ResetOptions = {},
): Promise<void> {
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public');
  // pg-boss's schema is Studio's too, and a reset that left it behind would
  // keep jobs naming rows the reset had just removed.
  await pool.query(`drop schema if exists ${JOB_SCHEMA} cascade`);

  if (options.sweepScratch) await sweepScratch(pool);

  await applySchema(pool);
  await seed(pool, options);
}

async function sweepScratch(pool: pg.Pool): Promise<void> {
  const leftoverSchemas = await pool.query<{ nspname: string }>(
    `select nspname from pg_namespace where nspname like 'studio\\_test\\_%'`,
  );
  for (const { nspname } of leftoverSchemas.rows) {
    await pool.query(
      `drop schema if exists ${pg.escapeIdentifier(nspname)} cascade`,
    );
  }
  if (leftoverSchemas.rowCount) {
    console.log(`Dropped ${leftoverSchemas.rowCount} leftover test schema(s).`);
  }

  const leftoverDatabases = await pool.query<{ datname: string }>(
    `select datname from pg_database where datname like 'studio\\_test\\_db\\_%'`,
  );
  for (const { datname } of leftoverDatabases.rows) {
    await pool.query(
      `drop database if exists ${pg.escapeIdentifier(datname)} with (force)`,
    );
  }
  if (leftoverDatabases.rowCount) {
    console.log(
      `Dropped ${leftoverDatabases.rowCount} leftover test database(s).`,
    );
  }
}
