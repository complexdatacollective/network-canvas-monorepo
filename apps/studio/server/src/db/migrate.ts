import { createHash } from 'node:crypto';

import { Effect } from 'effect';

import { installJobSchemaEffect } from '../jobs/install.ts';
import { JOB_SCHEMA } from '../jobs/queues.ts';
import { OwnerDatabase } from './client.ts';
import { SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import {
  checkSchemaEffect,
  SCHEMA_LOCK_KEY,
  staleDatabaseMessage,
  stampFingerprintEffect,
} from './schema.ts';
import { splitStatements } from './statements.ts';
import { OwnerScope, Transaction } from './tenant.ts';

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
  /**
   * The job queue's schema and its grants. Hashed rather than executed from
   * here: the schema is installed through the module that owns it
   * (`src/jobs/install.ts`), which is in the image, so what this
   * document carries is what the fingerprint covers.
   */
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
 * Applies this build's schema to the `OwnerDatabase`'s database. The owner is
 * the connecting login: the statements create the roles the server runs as,
 * so it needs `CREATEROLE` the first time (the same requirement `apply-schema`
 * documents).
 *
 * All or nothing. A partial application would be worse here than anywhere
 * else: the next run reads a database with tables and no fingerprint as
 * `stale` and refuses it, so an operator whose first migrate died halfway
 * would be told to recreate a database that has never worked. Rolling back to
 * empty means the next run simply applies. Three things carry that, and each
 * is forced by the driver:
 *
 *   * **The lock rides a reserved connection.** `pg_advisory_lock` is
 *     session-scoped, so the connection that takes it must be the one that
 *     holds it for the whole run. `sql.reserve` is that connection, and its
 *     scope is what releases it — an unlock in a `finally` could not survive
 *     an interrupt, and a scope finalizer does.
 *   * **`checkSchema` reads on the pool, not on the reserved connection.** It
 *     is a read, and running it on the pool is what proves the lock is held
 *     *across* it rather than merely around it: another migrate reaching the
 *     same database blocks at `pg_advisory_lock` before it can read.
 *   * **Every write is one transaction, statement by statement.**
 *     `@effect/sql-pg` has no simple-query path: every multi-command string
 *     is refused with `42601`, so the DDL goes through `splitStatements` —
 *     which is dollar-quote aware, and has to be, because the sidecars carry
 *     `plpgsql` bodies that a split on `;` would cut in half. The job schema
 *     and the stamp are inside the same transaction.
 *
 * The fingerprint is computed over the *unsplit* strings, so splitting here
 * does not move it.
 */
export const migrateDatabaseEffect = Effect.fn('db.migrate')(function* (
  ddl: SchemaDdl,
  { log = () => undefined }: MigrateOptions = {},
) {
  verifySchemaDdl(ddl);
  const owner = yield* OwnerDatabase;

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const lock = yield* owner.sql.reserve;
      yield* lock.executeUnprepared(
        `select pg_advisory_lock(${SCHEMA_LOCK_KEY})`,
        [],
        undefined,
      );
      yield* Effect.addFinalizer(() =>
        Effect.orDie(
          Effect.ignore(
            lock.executeUnprepared(
              `select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`,
              [],
              undefined,
            ),
          ),
        ),
      );

      // Read under the lock, so two one-shots racing on the same database
      // cannot both find it absent and both apply.
      const state = yield* checkSchemaEffect(owner.sql);
      if (state.kind === 'current') {
        log('Schema current.');
        return { kind: 'current' } satisfies MigrateOutcome;
      }
      if (state.kind === 'stale') {
        // The same words every process prints when it boots against such a
        // database: one verdict, one wording (src/db/schema.ts).
        return yield* Effect.fail(
          new StaleDatabase(staleDatabaseMessage(state)),
        );
      }

      yield* OwnerScope.open(
        Effect.gen(function* () {
          const { sql } = yield* Transaction;
          const statements = ddl.statements.flatMap((statement) =>
            splitStatements(statement),
          );
          log(`Applying ${statements.length} schema statement(s).`);
          for (const statement of statements) {
            yield* sql.unsafe(statement);
          }

          // After the schema, because the grants name the roles the sync
          // sidecar creates, and before the stamp, because a stamped database
          // has to be one a process can already enqueue against.
          log(`Installing the ${JOB_SCHEMA} schema.`);
          yield* installJobSchemaEffect(JOB_SCHEMA);

          // Last, and inside the transaction with everything it vouches for: a
          // stamp that could outlive a failed apply is a database that reads
          // as this build's and is not.
          yield* stampFingerprintEffect(sql, ddl.fingerprint);
        }),
      );

      log('Schema applied.');
      return { kind: 'applied' } satisfies MigrateOutcome;
    }),
  );
});
