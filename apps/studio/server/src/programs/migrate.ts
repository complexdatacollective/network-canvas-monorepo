import { readFile } from 'node:fs/promises';

import { Console, Effect, Layer, Schema } from 'effect';

import { OwnerDatabase } from '../db/client.ts';
import { migrateDatabase, type SchemaDdl } from '../db/migrate.ts';
import { createOwnerPool } from '../db/pool.ts';
import { OwnerScope } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import { LoggerLive } from '../platform/logger.ts';
import { TracingLive } from '../platform/tracing.ts';
import { verifyKeyring } from '../secrets/services.ts';
import {
  issueBootstrapToken,
  printBootstrapToken,
} from '../setup/bootstrap.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

// The image's third entry: `studio-api migrate`, the one-shot that creates the
// schema (#1909). It runs once per deployment, never per replica, which is why
// it is a command and not boot work — the web process and the worker only
// verify the fingerprint (src/platform/schema-gate.ts).
//
// It connects as the login in DATABASE_URL rather than as either pinned role:
// the statements create those roles, so the login needs `CREATEROLE` the first
// time, exactly as `apply-schema` documents for a repository checkout.
//
// A one-shot `Effect` rather than a launched Layer: it runs to completion and
// `NodeRuntime.runMain`'s teardown turns the outcome into the exit code — 0
// when the schema is in place, 1 for a refusal, whose message is printed as
// the failure. Stage 3 rewrites its body onto the Effect database clients;
// this stage only moves the shell.

/** What every refusal from this command is: a message for whoever typed it. */
class MigrateRefused extends Schema.TaggedError<MigrateRefused>()(
  'MigrateRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

/** A step of the migration that did not complete, reported by its own message. */
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
 * Written by `scripts/render-schema-ddl.ts` after `vite build`, so it sits
 * beside the emitted `dist/migrate.js` — read through `import.meta.url`
 * rather than the working directory, which a container runtime may set to
 * anything. Rollup rewrites `import.meta.url` to the emitted file's, and
 * every emitted file stays one level below the package root
 * (vite.config.ts), so the relative path holds wherever this module lands in
 * the bundle.
 */
const readSchemaDdl = Effect.tryPromise({
  try: async () =>
    // Typed at the parse site: `@total-typescript/ts-reset` types `JSON.parse`
    // as `unknown`, so the shape has to be stated before use; `verifySchemaDdl`
    // inside `migrateDatabase` checks the fingerprint it carries.
    JSON.parse(
      await readFile(new URL('./schema-ddl.json', import.meta.url), 'utf8'),
    ) as SchemaDdl,
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
  const ddl = yield* readSchemaDdl;

  const pool = yield* Effect.acquireRelease(
    Effect.sync(() => createOwnerPool(db)),
    (owner) => Effect.promise(() => owner.end()),
  );

  yield* Effect.tryPromise({
    try: () =>
      migrateDatabase(pool, ddl, {
        log: (line) => Effect.runSync(Console.log(line)),
      }),
    catch: (cause) => new MigrateFailed({ cause }),
  });

  // After the schema, before anything runs against it (#1900): the check
  // `apply-schema` runs in a checkout, so a database restored from a backup
  // that does not match the keyring is caught by the command an operator ran
  // by hand, with the output in front of them, rather than by the next
  // container start. `Environment` already refused to run without a keyring
  // at all. Before the bootstrap token, so a refused database never prints a
  // token nobody should use.
  yield* verifyKeyring;
  yield* Console.log(
    'Stored secrets are readable with the configured keyring.',
  );

  // First-run bootstrap (#1909): on a database nobody owns yet, issue the
  // token `/setup` spends and print it once — rotating any earlier one, so a
  // lost token is recovered by running this again. An owned instance issues
  // nothing and prints nothing. After `migrateDatabase`, because the
  // installation table exists only once its transaction has committed, and on
  // the OWNER scope, because neither application role holds INSERT on it —
  // arming an instance is deliberately not something the server can do.
  const token = yield* OwnerScope.open(issueBootstrapToken()).pipe(
    Effect.provide(OwnerDatabase.layer({ url: db.url })),
    Effect.catch((cause) => new MigrateFailed({ cause })),
  );
  printBootstrapToken(token, env.auth?.baseUrl);
});

/** The command, with the environment decoded once at its root. */
export const MigrateProgram = migrate.pipe(
  Effect.scoped,
  reportingRefusals,
  Effect.provide(
    Layer.mergeAll(LoggerLive, TracingLive('migrate')).pipe(
      Layer.provideMerge(Environment.layer),
    ),
  ),
);
