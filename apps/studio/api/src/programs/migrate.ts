import { readFile } from 'node:fs/promises';

import { Console, Effect, Layer, Schema } from 'effect';

import { OwnerDatabase } from '../db/client.ts';
import {
  migrateDatabaseEffect,
  readVerifiedMigrations,
} from '../db/migrate.ts';
import { OwnerScope } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import { LoggerLive } from '../platform/logger.ts';
import { TracingLive } from '../platform/tracing.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { verifyKeyring } from '../secrets/verify.ts';
import {
  issueBootstrapToken,
  printBootstrapToken,
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
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

/**
 * Read through `import.meta.url` rather than the working directory, which a
 * container runtime may set to anything. Rendered beside the bundle at build
 * time by `scripts/render-migrations.ts`; decoded and verified by
 * `readVerifiedMigrations`.
 */
const readMigrations = Effect.tryPromise({
  try: () => readFile(new URL('./migrations.json', import.meta.url), 'utf8'),
  catch: (cause) => new MigrateFailed({ cause }),
});

const migrate = Effect.gen(function* () {
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
  const migrations = yield* readMigrations.pipe(
    Effect.flatMap((text) => readVerifiedMigrations(text)),
    Effect.catch((cause) => new MigrateFailed({ cause })),
  );

  const owner = yield* Layer.build(OwnerDatabase.layer(db)).pipe(
    Effect.catch((cause) => new MigrateFailed({ cause })),
  );

  yield* migrateDatabaseEffect(migrations, {
    log: (line) => Effect.runSync(Console.log(line)),
    appliedBy: STUDIO_VERSION,
  }).pipe(
    Effect.catch((cause) => new MigrateFailed({ cause })),
    Effect.catchDefect((cause) => new MigrateFailed({ cause })),
    Effect.provide(owner),
  );

  // Before the bootstrap token, so a refused database never prints a token.
  yield* verifyKeyring.pipe(Effect.provide(SecretsCipher.layerFromEnvironment));
  yield* Console.log(
    'Stored secrets are readable with the configured keyring.',
  );

  // On the OWNER scope, because neither application role holds INSERT on the
  // installation table.
  const token = yield* OwnerScope.open(issueBootstrapToken()).pipe(
    Effect.provide(owner),
    Effect.catch((cause) => new MigrateFailed({ cause })),
  );
  printBootstrapToken(token, env.auth?.baseUrl);
});

export const MigrateProgram = migrate.pipe(
  Effect.scoped,
  Effect.provide(
    Layer.mergeAll(LoggerLive, TracingLive('migrate')).pipe(
      Layer.provideMerge(Environment.layer),
    ),
  ),
  // Outside the environment, so a refusal to read it is printed too.
  reportingRefusals,
);
