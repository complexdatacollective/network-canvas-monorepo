import { Console, Effect, Layer, Schema } from 'effect';

import { createMaintenancePool } from '../db/pool.ts';
import { Environment } from '../env.ts';
import { LoggerLive } from '../platform/logger.ts';
import { TracingLive } from '../platform/tracing.ts';
import { rotateSecrets as rotate } from '../secrets/rotate.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

// The rotation command: the same image as the web process and the worker,
// started with a different command (#1900). It re-encrypts every stored
// secret under the keyring's current entry, runs to completion and exits —
// nothing here serves a request or executes a job.
//
// Its own bundle entry, because the image's entrypoint is the `studio-api`
// script (#1909), which names each command by the file it runs. Running one
// therefore evaluates only what it needs: this process never loads the HTTP
// router or the job worker, and the web process never reaches the rotation,
// which a source-policy test pins (src/__tests__/process-separation.test.ts).
//
// A one-shot `Effect`: `NodeRuntime.runMain`'s teardown turns the outcome
// into the exit code, and the pool is released by its scope before the
// process ends, so a rotation that refused does not leave connections for the
// database to time out. Stage 6 rewrites the body onto the Effect clients;
// this stage only moves the shell.

/** A refusal before anything is touched: a message for whoever typed the command. */
class RotateRefused extends Schema.TaggedError<RotateRefused>()(
  'RotateRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

/** A rotation that did not complete, reported by the rotation's own message. */
class RotateFailed extends Schema.TaggedError<RotateFailed>()('RotateFailed', {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

const rotateSecrets = Effect.gen(function* () {
  const { db, secrets } = yield* Environment;
  if (!db) {
    return yield* new RotateRefused({
      reason:
        'DATABASE_URL is not set; there are no stored secrets to re-encrypt.',
    });
  }
  if (!secrets) {
    // `resolve` refuses a database with no keyring, so this cannot be reached
    // by a configuration; it keeps the narrowing honest.
    return yield* new RotateRefused({
      reason:
        'No secrets keyring is configured; set STUDIO_SECRETS_KEY_FILE or STUDIO_SECRETS_KEY.',
    });
  }

  yield* Console.log(`Network Canvas Studio rotate-secrets ${STUDIO_VERSION}`);

  // The cross-team identity, because rotation must visit every team's rows
  // and the tenant tables force row-level security on every other role.
  const pool = yield* Effect.acquireRelease(
    Effect.sync(() => createMaintenancePool(db)),
    (maintenance) => Effect.promise(() => maintenance.end()),
  );

  const counts = yield* Effect.tryPromise({
    try: () =>
      rotate(pool, secrets, {
        log: (message) => Effect.runSync(Console.log(message)),
      }),
    catch: (cause) => new RotateFailed({ cause }),
  });
  for (const [store, rotated] of Object.entries(counts)) {
    yield* Console.log(`${store}: ${rotated} re-sealed`);
  }
  yield* Console.log(
    `Every stored secret is now under key id "${secrets.currentId}". ` +
      'The older entries can be removed from the keyring once its backup is updated.',
  );
});

/** The command, with the environment decoded once at its root. */
export const RotateSecretsProgram = rotateSecrets.pipe(
  Effect.scoped,
  reportingRefusals,
  Effect.provide(
    Layer.mergeAll(LoggerLive, TracingLive('rotate-secrets')).pipe(
      Layer.provideMerge(Environment.layer),
    ),
  ),
);
