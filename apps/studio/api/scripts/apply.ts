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
import { HISTORY_TABLE } from '../src/db/history.ts';
import { sha256 } from '../src/db/migrations-document.ts';
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
// image's bundles. This is the checkout lane's push path: development
// databases and test fixtures. A deployment is upgraded only by `studio-api
// migrate`, from the numbered migrations under `migrations/` (#1901), and
// `applySchema` refuses any database that carries their history.

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
 * `renderSchemaStatements` deliberately stays the public statements alone —
 * they are the DDL the suites execute into a scratch schema, and the job
 * statements name their own schema rather than running inside that one.
 */
export async function computeSchemaFingerprint(): Promise<string> {
  return schemaFingerprintOf(
    await renderDrizzleSchemaStatements(),
    SIDECARS,
    renderJobStatements(),
  );
}

/**
 * The fingerprint's one definition: the drizzle statements an empty database
 * needs, then the sidecars, then the job schema's statements, joined with
 * newlines and hashed. Parameterised so `migrate:generate`'s tests can
 * fingerprint a fixture schema exactly as the real one is fingerprinted.
 */
export function schemaFingerprintOf(
  drizzleStatements: readonly string[],
  sidecars: readonly string[],
  jobStatements: readonly string[],
): string {
  return sha256(
    [...drizzleStatements, ...sidecars, ...jobStatements].join('\n'),
  );
}

export class MigratedDatabaseRefused extends Error {}

async function refuseMigratedDatabase(lock: pg.PoolClient): Promise<void> {
  const history = await lock.query<{ present: boolean }>(
    `select to_regclass('public.${HISTORY_TABLE}') is not null as present`,
  );
  if (!history.rows[0]?.present) return;
  const recorded = await lock.query<{ count: number; newest: string | null }>(
    `select count(*)::int as count, max(version) as newest from public.${HISTORY_TABLE}`,
  );
  const { count = 0, newest = null } = recorded.rows[0] ?? {};
  if (count > 0) {
    throw new MigratedDatabaseRefused(
      [
        `This database is managed by migrate (${count} migration(s), newest ${newest}); apply-schema never touches a migrated database.`,
        'Upgrade it with `studio-api migrate` (in the reference stack: `docker compose run --rm migrate`), or recreate a development database with `pnpm --filter @codaco/studio-api db:reset`.',
      ].join('\n'),
    );
  }
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
      'src/db/fingerprint.generated.ts does not match the schema definitions; run: pnpm --filter @codaco/studio-api sync-fingerprint',
    );
  }

  const lock = await pool.connect();
  try {
    await lock.query(`select pg_advisory_lock(${SCHEMA_LOCK_KEY})`);
    // Before anything is touched, the stamp included: a database carrying
    // migration history is upgraded by `migrate` alone (#1901). Pushing over
    // it would reconcile the schema without recording a migration, and the
    // next `migrate` would find history that no longer describes it.
    await refuseMigratedDatabase(lock);
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
    // which would drop the job tables as unmanaged.
    const push = await pushSchema(SCHEMA, drizzle({ client: pool }), {
      schemas: ['public'],
      tables: undefined,
      entities: undefined,
      extensions: undefined,
    });
    await push.apply();
    await lock.query(SIDECARS.join('\n'));
    // One transaction for everything after the push: the stamp belongs with what it
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
  await pool.query(`drop schema if exists ${JOB_SCHEMA} cascade`);
  await pool.query('drop schema if exists pgboss cascade');

  if (options.sweepScratch) await sweepScratch(pool);

  await applySchema(pool);
  await seedDatabase(db, options);
}

export function seedDatabase(
  db: DbEnv,
  options: SeedOptions,
): Promise<SeedResult> {
  return Effect.runPromise(
    seed(options).pipe(Effect.provide(OwnerDatabase.layer(db))),
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
