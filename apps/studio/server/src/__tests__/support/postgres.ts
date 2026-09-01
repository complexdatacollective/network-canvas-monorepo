import { randomUUID } from 'node:crypto';
import process from 'node:process';

import pg from 'pg';

import { TENANT_ROLES, TENANT_ROLES_SQL } from '@codaco/studio-sync/rls';

import { renderSchemaStatements } from '../../../scripts/apply.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { createOwnerPool } from '../../db/pool.ts';
import { stampFingerprint } from '../../db/schema.ts';
import { type DbEnv, isLocalDatabase, readEnv } from '../../env.ts';

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

export type ScratchSchema = {
  /** The connecting login: provisioning, fixtures, and cross-team oracles. */
  pool: pg.Pool;
  /** What the server runs as, with row-level security enforced. */
  app: pg.Pool;
  /** What garbage collection runs as. */
  maintenance: pg.Pool;
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

  return {
    pool,
    app,
    maintenance,
    dispose: async () => {
      await Promise.all([app.end(), maintenance.end(), pool.end()]);
      const cleanup = createOwnerPool(db);
      try {
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
 */
export async function provisionScratchSchema(pool: pg.Pool): Promise<void> {
  await pool.query((await renderSchemaStatements()).join('\n'));
  await stampFingerprint(pool, SCHEMA_FINGERPRINT);
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
