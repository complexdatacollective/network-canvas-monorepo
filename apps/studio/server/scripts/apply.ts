import { createHash } from 'node:crypto';

import {
  generateDrizzleJson,
  generateMigration,
  pushSchema,
} from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect } from 'effect';
import pg from 'pg';

import { OwnerDatabase } from '../src/db/client.ts';
import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import {
  SCHEMA,
  SCHEMA_LOCK_KEY,
  SIDECARS,
  stampFingerprint,
} from '../src/db/schema.ts';
import type { DbEnv } from '../src/env.ts';
import { installJobSchema } from '../src/jobs/install.ts';
import { JOB_SCHEMA, renderJobStatements } from '../src/jobs/queues.ts';
import { seed, type SeedOptions, type SeedResult } from './seed/seed.ts';

// Kept out of src/ so drizzle-kit (and its esbuild binary) can never reach the
// image's bundles. `studio-api migrate` applies the same schema from the DDL
// this file renders at build time — see src/db/migrate.ts.

// The test support has to hash the job statements without paying for
// drizzle-kit's module graph, so they are rendered in src/jobs/queues.ts and
// re-exported here — this file stays the one place that describes what a
// schema application consists of. Installing the job schema lives in
// src/jobs/install.ts for the same reason: `studio-api migrate` in the
// image does exactly what the call below does, and nothing in src/ may import
// drizzle-kit.
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
 * The public schema and the job queue's, hashed together: a change to either —
 * a column on `studio_jobs.jobs`, a job grant — is a schema change like any
 * other, applied once here and refused at boot by every process until it has
 * been.
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
 * Not transactional — a push failure partway leaves an unstamped database,
 * which checkSchema reports as stale and db:reset remedies.
 *
 * The pool needs at least two free connections: this holds one for the whole
 * apply (the advisory lock is session-scoped, so releasing it would release
 * the lock) while drizzle-kit's push checks out its own. A single-connection
 * pool deadlocks here until its connection timeout, not at the first
 * statement.
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
    // which would mean dropping the job tables as unmanaged. `public` is the
    // only schema Drizzle declares.
    const push = await pushSchema(SCHEMA, drizzle({ client: pool }), {
      schemas: ['public'],
      tables: undefined,
      entities: undefined,
      extensions: undefined,
    });
    await push.apply();
    await lock.query(SIDECARS.join('\n'));
    // One transaction for everything after the push: `installJobSchema`
    // applies its statements one at a time, so a failure part-way needs the
    // caller's transaction to undo it — and the stamp belongs with what it
    // vouches for either way. The push above stays outside it; drizzle-kit
    // manages its own statements and this function has never been atomic
    // across it (see the note above).
    await lock.query('begin');
    try {
      // After the sidecars, because the grants name the roles the sync sidecar
      // creates, and before the stamp, because a stamped database has to be
      // one where a process can already enqueue.
      await installJobSchema(lock, JOB_SCHEMA);
      await stampFingerprint(lock, fingerprint);
      await lock.query('commit');
    } catch (error) {
      await lock.query('rollback').catch(() => undefined);
      throw error;
    }
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
 * schema, and reseed. Shared by db-reset.ts (on demand) and dev.ts (every
 * `pnpm dev` boot) so the two sequences cannot drift apart. Callers own the
 * non-local safety check — this function always does the drop.
 */
export async function resetSchemaAndSeed(
  pool: pg.Pool,
  db: DbEnv,
  options: ResetOptions,
): Promise<void> {
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public');
  // The job schema is Studio's too, and a reset that left it behind would keep
  // jobs naming rows the reset had just removed. `pgboss` goes with it for as
  // long as databases created before #1957 are still around: it is nothing
  // this build installs, reads or recreates.
  await pool.query(`drop schema if exists ${JOB_SCHEMA} cascade`);
  await pool.query('drop schema if exists pgboss cascade');

  if (options.sweepScratch) await sweepScratch(pool);

  await applySchema(pool);
  await seedDatabase(db, options);
}

/**
 * The seed, on its own owner client. It is an Effect over `OwnerDatabase`
 * because the protocol store it writes through is, so it cannot share the
 * node-postgres pool the schema application above runs on — which is fine,
 * because it needs none of that pool's state: the schema it seeds is
 * committed by the time it runs, and the seed is one transaction of its own.
 */
export function seedDatabase(
  db: DbEnv,
  options: SeedOptions,
): Promise<SeedResult> {
  return Effect.runPromise(
    seed(options).pipe(Effect.provide(OwnerDatabase.layer({ url: db.url }))),
  );
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
