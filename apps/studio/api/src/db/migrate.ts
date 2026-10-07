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

export type SchemaDdl = {
  fingerprint: string;
  statements: string[];
  jobStatements: string[];
};

export type MigrateOutcome = { kind: 'current' } | { kind: 'applied' };

export function fingerprintOfDdl(ddl: SchemaDdl): string {
  return createHash('sha256')
    .update([...ddl.statements, ...ddl.jobStatements].join('\n'))
    .digest('hex');
}

export class SchemaDdlMismatch extends Error {}

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
  log?: MigrateLogger;
};

/**
 * `pg_advisory_lock` is session-scoped, so it rides a reserved connection
 * whose scope releases it.
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

          // After the schema, because the grants name the roles the sync sidecar
          // creates, and before the stamp.
          log(`Installing the ${JOB_SCHEMA} schema.`);
          yield* installJobSchemaEffect(JOB_SCHEMA);

          // Last, inside the transaction: a stamp that outlived a failed apply would
          // vouch for a database that is not this build's.
          yield* stampFingerprintEffect(sql, ddl.fingerprint);
        }),
      );

      log('Schema applied.');
      return { kind: 'applied' } satisfies MigrateOutcome;
    }),
  );
});
