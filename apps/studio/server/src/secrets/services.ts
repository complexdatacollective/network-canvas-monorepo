import { Context, Effect, Layer, Schema } from 'effect';

import { Environment } from '../env.ts';
import { createSecretsCipher, type SecretsCipherApi } from './cipher.ts';
import type { KeyringApi } from './keyring.ts';

// Studio's key custody as Effect services (#1927 §M2), landed in stage 3
// because stage-3 commands take the cipher from the environment rather than
// building one of their own.
//
// Two things, in the order they depend on each other: the keyring the
// deployment was started with and the cipher derived from it. The boot check
// that refuses a database this keyring cannot read is src/secrets/verify.ts.

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

const KeyringLive: Layer.Layer<Keyring, KeyringMissing, Environment> =
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
export const SecretsLive: Layer.Layer<
  Keyring | SecretsCipher,
  KeyringMissing,
  Environment
> = SecretsCipherLive.pipe(Layer.provideMerge(KeyringLive));
