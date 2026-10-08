import { Console, Effect, Layer, Schema } from 'effect';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { MaintenanceDatabase, OwnerDatabase } from '../db/client.ts';
import { deepestMessage } from '../db/errors.ts';
import {
  migrateDatabaseEffect,
  readVerifiedMigrations,
} from '../db/migrate.ts';
import { readBundledMigrations } from '../db/migrations-document.ts';
import { OwnerScope, Transaction } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import { InstallationIdentity } from '../platform/installation-identity.ts';
import { ObservabilityLive } from '../platform/tracing.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { verifyStoredKeys } from '../secrets/verify.ts';
import {
  issueBootstrapToken,
  printBootstrapToken,
  readInstallationId,
} from '../setup/bootstrap.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

// It connects as the login in DATABASE_URL rather than as either pinned role:
// the statements create those roles.

class MigrateRefused extends Schema.TaggedError<MigrateRefused>()(
  'MigrateRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

class MigrateFailed extends Schema.TaggedError<MigrateFailed>()(
  'MigrateFailed',
  { cause: Schema.Defect() },
) {
  // `@effect/sql-pg`'s own message is always `PgConnection: Query failed`;
  // the Postgres reason is causes deeper.
  override get message(): string {
    return deepestMessage(this.cause) ?? String(this.cause);
  }
}

const NOTHING_APPLIED =
  'Nothing was applied: the transaction rolled back, and the database is as it was before migrate ran.';

class KeyringRefusedUpgrade extends Schema.TaggedError<KeyringRefusedUpgrade>()(
  'KeyringRefusedUpgrade',
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return `${deepestMessage(this.cause) ?? String(this.cause)}\n${NOTHING_APPLIED}`;
  }
}

/**
 * The keyring check, inside the migration transaction and before it commits
 * (#1901 E-7): a keyring that cannot open what the upgraded database stores
 * rolls the upgrade back, so the operator can still return to the previous
 * image. It reads as `studio_maintenance`, whose policies see every team's
 * rows, on the transaction's own connection: the owner client stands in as
 * the maintenance database for the check, so its scope nests as a savepoint
 * of the migration transaction instead of opening a connection that could not
 * see the uncommitted schema.
 */
const keyringCheckedBeforeCommit = Effect.gen(function* () {
  const owner = yield* OwnerDatabase;
  const { sql } = yield* Transaction;
  yield* sql.unsafe(`SET LOCAL ROLE ${TENANT_ROLES.maintenance}`);
  yield* verifyStoredKeys.pipe(
    Effect.provideService(
      MaintenanceDatabase,
      MaintenanceDatabase.of({ ...owner, identity: 'maintenance' }),
    ),
    Effect.catchTag(
      ['SecretKeyIdMalformed', 'SecretKeyMissing', 'SecretKeyMaterial'],
      (cause) => Effect.fail(new KeyringRefusedUpgrade({ cause })),
    ),
  );
  yield* sql.unsafe('RESET ROLE');
});

/**
 * Rendered beside the bundle at build time by `scripts/render-migrations.ts`;
 * decoded and verified by `readVerifiedMigrations`.
 */
const readMigrations = Effect.tryPromise({
  try: readBundledMigrations,
  catch: (cause) => new MigrateFailed({ cause }),
});

const migrate = (document: Effect.Effect<string, unknown>) =>
  Effect.gen(function* () {
    const env = yield* Environment;
    const { db } = env;
    if (!db) {
      return yield* new MigrateRefused({
        reason:
          'DATABASE_URL is required for migrate: there is no database to create the schema in.',
      });
    }

    yield* Console.log(`Network Canvas Studio migrate ${STUDIO_VERSION}`);
    // Before the database is touched: a document this build did not render
    // is refused without a connection.
    const migrations = yield* document.pipe(
      Effect.flatMap((text) => readVerifiedMigrations(text)),
      Effect.catch((cause) => new MigrateFailed({ cause })),
    );

    const owner = yield* Layer.build(OwnerDatabase.layer(db)).pipe(
      Effect.catch((cause) => new MigrateFailed({ cause })),
    );
    const secrets = yield* Layer.build(SecretsCipher.layerFromEnvironment);
    const resolveInstallation = InstallationIdentity.resolveOnce(
      OwnerScope.open(readInstallationId()),
    ).pipe(Effect.provide(owner));
    yield* resolveInstallation;

    // A refusal of the keyring, of a statement or of the COMMIT already names
    // itself and says whether anything was applied; anything else is
    // reported as Postgres or the runner put it.
    yield* migrateDatabaseEffect(migrations, {
      log: (line) => Effect.runSync(Console.log(line)),
      appliedBy: STUDIO_VERSION,
      beforeCommit: keyringCheckedBeforeCommit,
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof KeyringRefusedUpgrade
          ? cause
          : new MigrateFailed({ cause }),
      ),
      Effect.catchDefect((cause) => new MigrateFailed({ cause })),
      Effect.provide(owner),
      Effect.provide(secrets),
    );
    yield* Console.log(
      'Stored secrets are readable with the configured keyring.',
    );
    yield* resolveInstallation;

    // On the OWNER scope, because neither application role holds INSERT on the
    // installation table. After the commit, so a refused database never
    // prints a token.
    const token = yield* OwnerScope.open(issueBootstrapToken()).pipe(
      Effect.provide(owner),
      Effect.catch((cause) => new MigrateFailed({ cause })),
    );
    yield* printBootstrapToken(token, env.auth?.baseUrl);
  });

/**
 * The migrate command over a migrations document from `document`. The image
 * reads the one rendered beside its bundle; a suite hands it one of its own.
 */
export const migrateProgramReading = (
  document: Effect.Effect<string, unknown>,
) =>
  migrate(document).pipe(
    Effect.scoped,
    Effect.provide(
      ObservabilityLive('migrate').pipe(Layer.provideMerge(Environment.layer)),
    ),
    // Outside the environment, so a refusal to read it is printed too.
    reportingRefusals,
  );

export const MigrateProgram = migrateProgramReading(readMigrations);
