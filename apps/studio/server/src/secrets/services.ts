import { Cause, Context, Effect, Layer, Schema } from 'effect';

import { MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import { type DbEnv, Environment, type StudioEnv } from '../env.ts';
import { assertSecretKeysProducible, SecretKeyCheckError } from './boot.ts';
import { createSecretsCipher, type SecretsCipherApi } from './cipher.ts';
import type { KeyringApi } from './keyring.ts';

// Studio's key custody as Effect services (#1927 §M2), pulled forward from
// stage 6 because the migrate graph needs the gate and stage-3 commands take
// the cipher from the environment rather than building one of their own.
//
// Three things, in the order they depend on each other: the keyring the
// deployment was started with, the cipher derived from it, and the boot check
// that refuses a database this keyring cannot read.

/**
 * No keyring at all. A layer failure rather than a thrown error, so a process
 * that asked for one refuses to build instead of dying inside whatever first
 * touched a secret.
 *
 * `resolve` already refuses a configured database with no keyring, so this is
 * the belt to that braces: a lane that ever reached here without one would be
 * about to write secrets it could not read back.
 */
export class KeyringMissing extends Schema.TaggedError<KeyringMissing>()(
  'KeyringMissing',
  {},
) {
  override get message(): string {
    return 'No secrets keyring is configured; set STUDIO_SECRETS_KEY_FILE or STUDIO_SECRETS_KEY.';
  }
}

/**
 * The keyring this process was started with, read once by the environment
 * layer. A malformed value never reaches here: `readEnv` parses it while the
 * `Environment` layer is being built, so the refusal names the entry that is
 * wrong (src/secrets/keyring.ts) rather than arriving as a missing service.
 */
export class Keyring extends Context.Service<Keyring, KeyringApi>()(
  '@studio/secrets/Keyring',
) {}

export const KeyringLive: Layer.Layer<Keyring, KeyringMissing, Environment> =
  Layer.effect(
    Keyring,
    Effect.flatMap(Environment, (env) =>
      env.secrets === undefined
        ? Effect.fail(new KeyringMissing())
        : Effect.succeed(env.secrets),
    ),
  );

/**
 * The one cipher for the process: every seal and every open in the program
 * goes through this service rather than through a cipher a call site built for
 * itself, so a single keyring answers for the whole of it.
 *
 * Its functions are synchronous and none of them is typed to fail. A value
 * that will not open under the key it names is a defect — there is nothing a
 * caller can usefully do about a key that cannot read its own ciphertext — and
 * `KeyringVerified` below is what turns that into a refusal to start rather
 * than a surprise at request time.
 */
export class SecretsCipher extends Context.Service<
  SecretsCipher,
  SecretsCipherApi
>()('@studio/secrets/SecretsCipher') {}

export const SecretsCipherLive: Layer.Layer<SecretsCipher, never, Keyring> =
  Layer.effect(SecretsCipher, Effect.map(Keyring, createSecretsCipher));

/**
 * The cipher a process with **no keyring** has, which the environment layer
 * allows only where there is no database either — and every surface that would
 * seal or open a secret needs one of those. Reaching it is a programming error
 * rather than a deployment state, for the reason `DatabaseAbsent` gives.
 */
export const SecretsCipherAbsent: Layer.Layer<SecretsCipher> = Layer.succeed(
  SecretsCipher,
)(
  new Proxy({} as SecretsCipherApi, {
    get: (_target, property) => {
      throw new Error(
        `this process has no secrets keyring: nothing may read SecretsCipher.${String(property)}`,
      );
    },
  }),
);

/** The keyring and the cipher over it, which is how every consumer wants both. */
const SecretsLive: Layer.Layer<
  Keyring | SecretsCipher,
  KeyringMissing,
  Environment
> = SecretsCipherLive.pipe(Layer.provideMerge(KeyringLive));

/**
 * The stored key ids this keyring cannot read, as the one failure a boot has
 * to report. The message is the check's own — which names key ids that are
 * well formed and *counts* the ones that are not, because those come back out
 * of a database column and a boot refusal is the thing most likely to be
 * pasted into an issue.
 */
export class StoredKeysUnreadable extends Schema.TaggedError<StoredKeysUnreadable>()(
  'StoredKeysUnreadable',
  { cause: Schema.Defect() },
) {
  override get message(): string {
    const { cause } = this;
    return cause instanceof SecretKeyCheckError
      ? cause.message
      : `Could not read the stored secret key ids: ${String(cause)}`;
  }
}

/**
 * The check itself. The maintenance client is built and released inside this
 * effect's own scope rather than the surrounding layer's: it is the one
 * identity that sees every team's rows, and a cross-team client that outlived
 * a boot check would sit for the life of a process that serves requests as the
 * application role.
 *
 * One transaction for the whole check, which is what `MaintenanceScope.open`
 * around the whole of `assertSecretKeysProducible` buys: the ids it counts and
 * the rows it probes are one reading of the database.
 *
 * Everything the check can answer with becomes `StoredKeysUnreadable` — its
 * three refusals, a statement that failed, and a client that could not be
 * built — because a boot has exactly one thing to report and the message
 * getter already tells the two apart.
 */
const verifyAgainst = (db: DbEnv) =>
  Effect.gen(function* () {
    const keyring = yield* Keyring;
    const cipher = yield* SecretsCipher;
    yield* MaintenanceScope.open(assertSecretKeysProducible(keyring, cipher));
  }).pipe(
    Effect.provide(
      MaintenanceDatabase.layer({
        url: db.url,
        applicationName: 'studio-secrets-check',
      }),
    ),
    Effect.catch((cause) => new StoredKeysUnreadable({ cause })),
  );

/**
 * Refuses a database whose stored secrets this keyring cannot read, in the
 * order the three faults have to be told apart: key ids nothing could open,
 * then ids this keyring does not carry, then ids it carries under the wrong
 * key material (src/secrets/boot.ts).
 *
 * Nothing to verify without a database, and the keyring is not required to
 * exist in that case — which is why the branch is taken before either secrets
 * layer is built.
 */
export const verifyKeyring: Effect.Effect<
  void,
  KeyringMissing | StoredKeysUnreadable,
  Environment
> = Effect.flatMap(Environment, (env) =>
  env.db === undefined
    ? Effect.void
    : verifyAgainst(env.db).pipe(Effect.provide(SecretsLive)),
);

/**
 * The same check as a gate: a layer that provides nothing and whose only
 * effect is to refuse. Anything given it with `Layer.provide` is built after
 * it, which is what makes "verified before it serves" a property of the graph
 * rather than of a call in the right place.
 */
export const KeyringVerified: Layer.Layer<
  never,
  KeyringMissing | StoredKeysUnreadable,
  Environment
> = Layer.effectDiscard(verifyKeyring);

/**
 * The same refusal for a process that has nothing above it to catch one: the
 * hand-run schema apply (scripts/apply-schema.ts), which stays on
 * node-postgres for the apply itself and borrows this for the check.
 *
 * Prints and exits rather than failing, because a stack trace would bury the
 * one sentence that says what to do. It runs `verifyKeyring` rather than the
 * check underneath it, so the script and the two entrypoints refuse on exactly
 * the same conditions in exactly the same order.
 *
 * Resolves only when there is no database to check, or when every stored key
 * id is well formed, is in the keyring, and opens a row that was sealed under
 * it.
 */
export const verifySecretKeysOrExit = (env: StudioEnv): Promise<void> =>
  Effect.runPromise(
    verifyKeyring.pipe(
      // A defect is caught too: a boot diagnostic that printed nothing and
      // rejected would leave the operator with an unhandled rejection instead
      // of the sentence.
      Effect.catchCause((cause) => {
        const failure: unknown = Cause.squash(cause);
        return Effect.sync(() => {
          // oxlint-disable-next-line no-console -- boot diagnostics
          console.error(
            failure instanceof Error ? failure.message : String(failure),
          );
          process.exit(1);
        });
      }),
      Effect.provideService(Environment)(env),
    ),
  );
