import { createHash } from 'node:crypto';

import {
  generateDrizzleJson,
  generateMigration,
  pushSchema,
} from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import {
  SCHEMA,
  SCHEMA_LOCK_KEY,
  SIDECARS,
  stampFingerprint,
} from '../src/db/schema.ts';
import { seed, type SeedOptions } from '../src/db/seed.ts';

// Kept out of src/ so drizzle-kit (and its esbuild binary) can never reach
// the server or Netlify bundles.

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

export async function computeSchemaFingerprint(): Promise<string> {
  return createHash('sha256')
    .update((await renderSchemaStatements()).join('\n'))
    .digest('hex');
}

export type ApplyOutcome = {
  statements: string[];
  hints: { hint: string; statement?: string }[];
};

/**
 * Developer-only reconciliation for disposable resets, demos and schema tests.
 * Production uses src/db/migrations/migrate.ts and immutable migration files.
 * Not transactional — a push failure partway leaves an unstamped database,
 * which checkSchema reports as stale and db:reset remedies.
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
    const history = await lock.query<{ present: boolean }>(
      "select to_regclass('studio_migrations.history') is not null as present",
    );
    if (history.rows[0]?.present) {
      throw new Error(
        'Developer schema reconciliation refuses a versioned database. Run migrate, or explicitly db:reset a disposable development database.',
      );
    }
    // A matching stamp must not survive a failed apply: a drifted database
    // would keep reading `current`. Cleared here, restored only on success.
    const stamped = await lock.query<{ present: boolean }>(
      `select to_regclass('"schemaFingerprint"') is not null as present`,
    );
    if (stamped.rows[0]?.present) {
      await lock.query('delete from "schemaFingerprint"');
    }
    const push = await pushSchema(SCHEMA, drizzle({ client: pool }));
    await push.apply();
    await lock.query(SIDECARS.join('\n'));
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
  // A reset deliberately replaces the database with synthetic development
  // content. It must not leave an old production migration ledger beside it.
  await pool.query('drop schema if exists studio_migrations cascade');

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
