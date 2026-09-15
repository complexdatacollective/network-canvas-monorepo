import { createHash } from 'node:crypto';

import type pg from 'pg';

import { JOB_SCHEMA } from '@codaco/studio-sync/jobs';

import { installJobSchema, syncJobQueues } from '../jobs/install.ts';
import { SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { checkSchema, SCHEMA_LOCK_KEY, stampFingerprint } from './schema.ts';

// `studio-api migrate`, the deployed half of schema application (#1909).
//
// `scripts/apply-schema` reconciles a database with drizzle-kit push, and
// drizzle-kit is a development dependency that must never reach the image. So
// the build renders the statements push would have produced into
// `dist/schema-ddl.json` (scripts/render-schema-ddl.ts) and this module
// executes them. The same bytes hash to `SCHEMA_FINGERPRINT`, which is what
// makes "the DDL in the image is this build's schema" checkable rather than
// assumed — and the suites have executed these very statements into scratch
// schemas since #1247, which is why applying them is not a new path.
//
// Pre-release, that is all it can do: an empty database is created, a current
// one is left alone, and a database some other build created is refused rather
// than reconciled. Versioned migrations are #1901, which replaces the body of
// this module without changing the command, the one-shot service, or what
// either prints.

/** What `scripts/render-schema-ddl.ts` writes beside the bundle. */
export type SchemaDdl = {
  /** `SCHEMA_FINGERPRINT` as of the build that rendered these statements. */
  fingerprint: string;
  /** The public schema: drizzle's create statements, then the sidecars. */
  statements: string[];
  /** pg-boss's construction plan, its grants, and the queue declarations. */
  jobStatements: string[];
};

export type MigrateOutcome =
  /** The database already carried this build's schema; nothing was written. */
  | { kind: 'current' }
  /** The database was empty and now carries this build's schema. */
  | { kind: 'applied' };

/**
 * The fingerprint of a rendered DDL document, computed exactly as
 * `computeSchemaFingerprint` in scripts/apply.ts computes it. Re-hashing what
 * the file holds is what turns the recorded `fingerprint` into a claim the
 * file has to keep: a truncated or hand-edited document no longer hashes to
 * the value beside it.
 */
export function fingerprintOfDdl(ddl: SchemaDdl): string {
  return createHash('sha256')
    .update([...ddl.statements, ...ddl.jobStatements].join('\n'))
    .digest('hex');
}

export class SchemaDdlMismatch extends Error {}

/**
 * Refuses a DDL document that is not this build's, and returns it otherwise.
 * Both directions are checked because they fail differently: a recorded
 * fingerprint that is not `SCHEMA_FINGERPRINT` is a bundle and a DDL file from
 * different builds, and statements that do not hash to their own recorded
 * fingerprint are a damaged file.
 */
export function verifySchemaDdl(ddl: SchemaDdl): SchemaDdl {
  if (ddl.fingerprint !== SCHEMA_FINGERPRINT) {
    throw new SchemaDdlMismatch(
      `The schema DDL beside this bundle was rendered by a different build: it records ${ddl.fingerprint.slice(0, 12)} and this build is ${SCHEMA_FINGERPRINT.slice(0, 12)}. Rebuild the image.`,
    );
  }
  const rehashed = fingerprintOfDdl(ddl);
  if (rehashed !== ddl.fingerprint) {
    throw new SchemaDdlMismatch(
      `The schema DDL beside this bundle does not hash to the fingerprint it records (${rehashed.slice(0, 12)} against ${ddl.fingerprint.slice(0, 12)}); the file is damaged. Rebuild the image.`,
    );
  }
  return ddl;
}

/** Where a stale database's refusal is written out, in one place. */
function staleDatabaseMessage(found: string | null): string {
  return [
    'The database was not created by this build.',
    found === null
      ? 'It carries Studio tables but no fingerprint, so the SQL that built it is unknown.'
      : `It records ${found.slice(0, 12)} and this build is ${SCHEMA_FINGERPRINT.slice(0, 12)}.`,
    'Studio is pre-release and has no migration system yet, so a build cannot upgrade a database another build created (#1901).',
    'Recreate the database and run migrate against it again, or wait for the migration system.',
  ].join('\n');
}

export class StaleDatabase extends Error {}

export type MigrateLogger = (line: string) => void;

export type MigrateOptions = {
  /** One line per step. Defaults to nothing, which is what the suites want. */
  log?: MigrateLogger;
};

/**
 * Applies this build's schema to `pool`'s database, which must be the owner
 * pool: the statements create the roles the server runs as, so the login needs
 * `CREATEROLE` the first time (the same requirement `apply-schema` documents).
 *
 * The pool needs at least two free connections. One client holds the advisory
 * lock for the whole run — it is session-scoped, so releasing the client would
 * release the lock — while the queue reconciliation checks out its own.
 */
export async function migrateDatabase(
  pool: pg.Pool,
  ddl: SchemaDdl,
  { log = () => undefined }: MigrateOptions = {},
): Promise<MigrateOutcome> {
  verifySchemaDdl(ddl);

  const lock = await pool.connect();
  try {
    await lock.query(`select pg_advisory_lock(${SCHEMA_LOCK_KEY})`);

    // Read under the lock, so two one-shots racing on the same database cannot
    // both find it absent and both apply.
    const state = await checkSchema(pool);
    if (state.kind === 'current') {
      log('Schema current.');
      return { kind: 'current' };
    }
    if (state.kind === 'stale') {
      throw new StaleDatabase(staleDatabaseMessage(state.found));
    }

    // One transaction: a failure part-way must not leave a half-built database
    // that the next run would read as `stale` and refuse. Postgres runs DDL
    // transactionally, and the suites have executed these same statements as
    // one multi-statement query into a scratch schema since #1247.
    log(`Applying ${ddl.statements.length} schema statement(s).`);
    await lock.query('begin');
    try {
      await lock.query(ddl.statements.join('\n'));
      await lock.query('commit');
    } catch (error) {
      await lock.query('rollback').catch(() => undefined);
      throw error;
    }

    // After the schema, because the grants name the roles the sync sidecar
    // creates, and before the stamp, because a stamped database has to be one
    // where a process can already enqueue — the order `applySchema` runs in.
    log(`Installing the ${JOB_SCHEMA} schema.`);
    await installJobSchema(lock, JOB_SCHEMA);
    log('Reconciling the job queues.');
    await syncJobQueues(pool, JOB_SCHEMA);

    // PR 4 (#1909) prints the first-run bootstrap token here, on a database
    // that has no owner yet.

    await stampFingerprint(lock, ddl.fingerprint);
    log('Schema applied.');
    return { kind: 'applied' };
  } finally {
    await lock
      .query(`select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`)
      .catch(() => undefined);
    lock.release();
  }
}
