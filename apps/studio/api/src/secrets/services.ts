import { Context, Effect, Layer, Schema } from 'effect';

import { Environment } from '../env.ts';
import { createSecretsCipher, type SecretsCipherApi } from './cipher.ts';
import type { KeyringApi } from './keyring.ts';

export class KeyringMissing extends Schema.TaggedError<KeyringMissing>()(
  'KeyringMissing',
  {},
) {
  override get message(): string {
    return 'No secrets keyring is configured; set STUDIO_SECRETS_KEY_FILE or STUDIO_SECRETS_KEY.';
  }
}

export class Keyring extends Context.Service<Keyring, KeyringApi>()(
  '@studio/secrets/Keyring',
) {
  static readonly layer: Layer.Layer<Keyring, KeyringMissing, Environment> =
    Layer.effect(
      Keyring,
      Effect.flatMap(Environment, (env) =>
        env.secrets === undefined
          ? Effect.fail(new KeyringMissing())
          : Effect.succeed(env.secrets),
      ),
    );
}

export class SecretsCipher extends Context.Service<
  SecretsCipher,
  SecretsCipherApi
>()('@studio/secrets/SecretsCipher') {
  static readonly layer: Layer.Layer<SecretsCipher, never, Keyring> =
    Layer.effect(SecretsCipher, Effect.map(Keyring, createSecretsCipher));

  static readonly layerAbsent: Layer.Layer<SecretsCipher> = Layer.succeed(
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

  static readonly layerFromEnvironment: Layer.Layer<
    Keyring | SecretsCipher,
    KeyringMissing,
    Environment
  > = SecretsCipher.layer.pipe(Layer.provideMerge(Keyring.layer));
}
