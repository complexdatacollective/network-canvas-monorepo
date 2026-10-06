import { Effect, Schema } from 'effect';
import type { SqlClient } from 'effect/sql';

import { OwnerDatabase } from './client.ts';
import {
  createHistoryTable,
  HISTORY_TABLE,
  historyVerdict,
  type ImageMigration,
  MigrationHistoryRefused,
  readHistory,
  recordApplied,
  refusalFor,
  revokeHistory,
} from './history.ts';
import {
  type DocumentMigration,
  MigrationsDocument,
  MigrationsDocumentRefused,
  type VerifiedMigrations,
  verifyMigrations,
} from './migrations-document.ts';
import {
  SCHEMA_LOCK_KEY,
  SCHEMA_TABLES,
  stampFingerprintEffect,
} from './schema.ts';
import { splitStatements } from './statements.ts';
import { OwnerScope, Transaction } from './tenant.ts';

// `studio-api migrate` (#1901): apply the numbered migrations this image
// carries that the database has not recorded, in one transaction, under the
// schema lock. drizzle's and Effect's migrators were both ruled out (#1901
// decision log, 2026-09-16): neither verifies hashes, refuses reordered or
// newer history, or holds a lock across the check and the transaction.

export type MigrateOutcome =
  | { readonly kind: 'current' }
  | { readonly kind: 'applied'; readonly versions: readonly string[] };

export type MigrateLogger = (line: string) => void;

export type MigrateOptions = {
  readonly log?: MigrateLogger;
  /** Recorded in `studio_migrations.applied_by`: the image's `STUDIO_VERSION`. */
  readonly appliedBy?: string;
};

type Probe = {
  readonly history: boolean;
  readonly tables: boolean;
  readonly stamped: boolean;
};

const imageMigration = (migration: DocumentMigration): ImageMigration => ({
  version: migration.version,
  ordinal: migration.ordinal,
  combined: migration.manifest.combined,
  artefacts: migration.manifest.artefacts,
});

const probeDatabase = Effect.fn('db.migrate.probe')(function* (
  client: SqlClient.SqlClient,
) {
  const rows = yield* client.unsafe<Probe>(
    `select to_regclass('public.${HISTORY_TABLE}') is not null as history,
            to_regclass('"schemaFingerprint"') is not null as stamped,
            ${SCHEMA_TABLES.map(
              (table) => `to_regclass('"${table}"') is not null`,
            ).join(' or ')} as tables`,
  );
  return rows[0] ?? { history: false, tables: false, stamped: false };
});

const readStamp = Effect.fn('db.migrate.readStamp')(function* (
  client: SqlClient.SqlClient,
) {
  const rows = yield* client.unsafe<{ fingerprint: string }>(
    'select "fingerprint" from "schemaFingerprint"',
  );
  return rows[0]?.fingerprint ?? null;
});

/**
 * A backfill that touches tenant tables runs as the maintenance role
 * (`SET LOCAL ROLE studio_maintenance` … `RESET ROLE`), because the policy on
 * a FORCEd table admits nobody else, and the owner login on managed Postgres
 * is not a superuser. One that forgets the `RESET` would run every later
 * statement of the upgrade as that role.
 */
const assertSessionRole = Effect.fn('db.migrate.assertRole')(function* (
  client: SqlClient.SqlClient,
  where: string,
) {
  const rows = yield* client.unsafe<{ current: string; session: string }>(
    'select current_user as current, session_user as session',
  );
  const row = rows[0];
  if (row !== undefined && row.current !== row.session) {
    return yield* new MigrationHistoryRefused({
      verdict: 'role',
      message: `${where} left the session running as ${row.current} rather than ${row.session}: end a backfill's SET LOCAL ROLE with RESET ROLE.`,
    });
  }
});

/**
 * `pg_advisory_lock` is session-scoped, so it rides a reserved connection
 * whose scope releases it, and it is taken before the history is read: two
 * one-shots racing on one database serialise, and the second finds the
 * first's history and applies nothing. The transaction runs on the pool while
 * the reserved connection holds the lock (#1901, 2026-09-16).
 */
export const migrateDatabaseEffect = Effect.fn('db.migrate')(function* (
  migrations: VerifiedMigrations,
  { log = () => undefined, appliedBy = 'unknown' }: MigrateOptions = {},
) {
  const owner = yield* OwnerDatabase;
  const image = migrations.migrations.map(imageMigration);

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

      return yield* OwnerScope.open(
        Effect.gen(function* () {
          const { sql } = yield* Transaction;
          const probe = yield* probeDatabase(sql);
          const recorded = probe.history ? yield* readHistory() : [];

          // No baseline (#1901 ruling, 2026-09-14): a database carrying Studio
          // tables and no history was built by apply-schema or by a
          // pre-release image, and nothing here can know what it holds.
          if (recorded.length === 0 && probe.tables) {
            return yield* new MigrationHistoryRefused({
              verdict: 'foreign',
              message:
                'This database carries Studio tables but no migration history: it was not created by migrate (an apply-schema or pre-release database), so what it holds is unknown. Recreate it and run migrate against the empty database.',
            });
          }

          const verdict = historyVerdict(recorded, image);
          if (verdict.kind !== 'pending') {
            return yield* refusalFor(verdict);
          }

          const newest = recorded.at(-1);
          if (newest !== undefined) {
            const stamp = probe.stamped ? yield* readStamp(sql) : null;
            const expected =
              migrations.migrations[newest.ordinal - 1]?.manifest.fingerprint;
            if (stamp !== expected) {
              return yield* new MigrationHistoryRefused({
                verdict: 'inconsistent',
                message: `This database records ${newest.version} as applied, but its schema fingerprint is ${stamp?.slice(0, 12) ?? 'missing'} rather than that migration's ${expected?.slice(0, 12)}: it was changed outside migrate. Restore the backup taken before the upgrade.`,
              });
            }
          }

          if (verdict.pending.length === 0) {
            log('Schema current.');
            return { kind: 'current' } satisfies MigrateOutcome;
          }

          // Inside the transaction, so a failed first run leaves an empty
          // database rather than a history table with no rows.
          if (!probe.history) yield* createHistoryTable();

          for (const pending of verdict.pending) {
            const migration = migrations.migrations[pending.ordinal - 1]!;
            const count = migration.artefacts.reduce(
              (total, artefact) => total + splitStatements(artefact.sql).length,
              0,
            );
            log(`Applying ${migration.version} (${count} statement(s)).`);
            for (const { name, sql: artefact } of migration.artefacts) {
              for (const statement of splitStatements(artefact)) {
                yield* sql.unsafe(statement);
              }
              yield* assertSessionRole(sql, `${migration.version}/${name}`);
            }
            // After the artefacts, whose sidecars re-run the broad grant over
            // every table in `public`, and before the row it protects.
            yield* revokeHistory();
            yield* recordApplied(pending, appliedBy);
          }

          // Last, inside the transaction: a stamp that outlived a failed apply
          // would vouch for a database that is not this build's.
          yield* stampFingerprintEffect(sql, migrations.fingerprint);

          const versions = verdict.pending.map(({ version }) => version);
          log(`Applied ${versions.join(', ')}.`);
          return { kind: 'applied', versions } satisfies MigrateOutcome;
        }),
      );
    }),
  );
});

const decodeDocument = Schema.decodeUnknownEffect(
  Schema.fromJsonString(MigrationsDocument),
);

/**
 * `dist/migrations.json` to a document `migrateDatabaseEffect` accepts:
 * decoded, then verified against this build's fingerprint. A document another
 * build rendered, or one that does not re-hash to its manifests, is refused
 * here, before any connection is taken.
 */
export const readVerifiedMigrations = Effect.fn('db.readVerifiedMigrations')(
  function* (text: string, expectedFingerprint?: string) {
    const document = yield* decodeDocument(text).pipe(
      Effect.mapError(
        (error) =>
          new MigrationsDocumentRefused({
            message: `The migrations beside this bundle are not a migrations document (${error.message}). Rebuild the image.`,
          }),
      ),
    );
    return yield* Effect.try({
      try: () => verifyMigrations(document, expectedFingerprint),
      catch: (error) =>
        error instanceof MigrationsDocumentRefused
          ? error
          : new MigrationsDocumentRefused({ message: String(error) }),
    });
  },
);
