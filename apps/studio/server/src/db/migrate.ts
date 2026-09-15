import { createHash } from 'node:crypto';

import type pg from 'pg';

import { JOB_SCHEMA } from '@codaco/studio-sync/jobs';

import { installJobSchema, syncJobQueues } from '../jobs/install.ts';
import { SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import {
  checkSchema,
  SCHEMA_LOCK_KEY,
  staleDatabaseMessage,
  stampFingerprint,
} from './schema.ts';

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
 * All or nothing. One client holds the advisory lock for the whole run — it is
 * session-scoped, so releasing the client would release the lock — and every
 * write goes through that one client inside one transaction, pg-boss's queue
 * reconciliation included. A partial application would be worse here than
 * anywhere else: the next run reads a database with tables and no fingerprint
 * as `stale` and refuses it, so an operator whose first migrate died halfway
 * would be told to recreate a database that has never worked. Rolling back to
 * empty means the next run simply applies.
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
      // The same words every process prints when it boots against such a
      // database: one verdict, one wording (src/db/schema.ts).
      throw new StaleDatabase(staleDatabaseMessage(state));
    }

    // Postgres runs DDL transactionally, and pg-boss's construction plan uses
    // nothing that cannot run in a transaction, so the whole application is
    // one. The suites have executed the public statements as a single
    // multi-statement query into a scratch schema since #1247.
    await lock.query('begin');
    try {
      log(`Applying ${ddl.statements.length} schema statement(s).`);
      await lock.query(ddl.statements.join('\n'));

      // After the schema, because the grants name the roles the sync sidecar
      // creates, and before the stamp, because a stamped database has to be
      // one where a process can already enqueue — the order `applySchema`
      // runs in.
      log(`Installing the ${JOB_SCHEMA} schema.`);
      await installJobSchema(lock, JOB_SCHEMA);
      log('Reconciling the job queues.');
      await syncJobQueues(lock, JOB_SCHEMA);

      // PR 4 (#1909) prints the first-run bootstrap token here, on a database
      // that has no owner yet.

      // Last, and inside the transaction with everything it vouches for: a
      // stamp that could outlive a failed apply is a database that reads as
      // this build's and is not.
      await stampFingerprint(lock, ddl.fingerprint);
      await lock.query('commit');
    } catch (error) {
      await lock.query('rollback').catch(() => undefined);
      throw error;
    }

    log('Schema applied.');
    return { kind: 'applied' };
  } finally {
    await lock
      .query(`select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`)
      .catch(() => undefined);
    lock.release();
  }
}
