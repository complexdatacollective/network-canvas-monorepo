import { Effect, Layer, Option, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { type DatabaseConfig, MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope, type Transaction } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import type { SecretsCipherApi } from './cipher.ts';
import { isKeyId, type KeyringApi } from './keyring.ts';
import { Keyring, SecretsCipher } from './services.ts';
import { SECRET_STORES } from './stores.ts';

/**
 * Counted per table and never printed: these ids are read back out of stored
 * text.
 */
export class SecretKeyIdMalformed extends Schema.TaggedError<SecretKeyIdMalformed>()(
  'SecretKeyIdMalformed',
  {
    counts: Schema.Array(
      Schema.Struct({ store: Schema.String, count: Schema.Number }),
    ),
  },
) {
  override get message(): string {
    return (
      `${this.counts
        .map(({ store, count }) =>
          count === 1
            ? `1 stored key id in ${store} is not a keyring id`
            : `${count} stored key ids in ${store} are not keyring ids`,
        )
        .join('; ')}. ` +
      'Nothing can open those rows. Restore the database backup that matches ' +
      'this keyring, or repair the rows before starting.'
    );
  }
}

export class SecretKeyMissing extends Schema.TaggedError<SecretKeyMissing>()(
  'SecretKeyMissing',
  { keyIds: Schema.Array(Schema.String) },
) {
  override get message(): string {
    return (
      `Stored secrets use key id(s) the keyring cannot produce: ${this.keyIds.join(', ')}. ` +
      'Restore the entry to STUDIO_SECRETS_KEY / STUDIO_SECRETS_KEY_FILE, or ' +
      'restore the database backup that matches this keyring.'
    );
  }
}

export class SecretKeyMaterial extends Schema.TaggedError<SecretKeyMaterial>()(
  'SecretKeyMaterial',
  { keyId: Schema.String },
) {
  override get message(): string {
    return (
      `Key id "${this.keyId}" in the keyring does not open the stored secrets sealed under it; ` +
      'restore the keyring that matches this database.'
    );
  }
}

export type SecretKeyCheckError =
  | SecretKeyIdMalformed
  | SecretKeyMissing
  | SecretKeyMaterial;

export const secretKeyIdsInUse: Effect.Effect<
  string[],
  SqlError.SqlError,
  Transaction
> = Effect.fn('secrets.verify.secretKeyIdsInUse')(function* () {
  const ids = new Set<string>();
  for (const store of SECRET_STORES) {
    for (const id of yield* store.keyIdsInUse) ids.add(id);
  }
  return [...ids].toSorted();
})();

const checkStoredKeys = Effect.fnUntraced(function* (
  keyring: KeyringApi,
  cipher: SecretsCipherApi,
) {
  const malformed: { store: string; count: number }[] = [];
  const inUse = new Set<string>();
  for (const store of SECRET_STORES) {
    let count = 0;
    for (const id of yield* store.keyIdsInUse) {
      if (isKeyId(id)) inUse.add(id);
      else count += 1;
    }
    if (count > 0) malformed.push({ store: store.name, count });
  }
  if (malformed.length > 0) {
    return yield* new SecretKeyIdMalformed({ counts: malformed });
  }

  const ids = [...inUse].toSorted();
  const missing = ids.filter((id) => !keyring.has(id));
  if (missing.length > 0) {
    return yield* new SecretKeyMissing({ keyIds: missing });
  }

  for (const store of SECRET_STORES) {
    for (const keyId of ids) {
      const opener = yield* store.probe(keyId);
      if (Option.isNone(opener)) continue;
      yield* Effect.try({
        try: () => {
          opener.value(cipher);
        },
        catch: () => new SecretKeyMaterial({ keyId }),
      });
    }
  }
});

export const verifyStoredKeys: Effect.Effect<
  void,
  SecretKeyCheckError | SqlError.SqlError,
  Keyring | SecretsCipher | MaintenanceDatabase
> = Effect.fn('secrets.verify.verifyStoredKeys')(function* () {
  const keyring = yield* Keyring;
  const cipher = yield* SecretsCipher;
  yield* MaintenanceScope.open(checkStoredKeys(keyring, cipher));
})();

export class StoredKeysUnreadable extends Schema.TaggedError<StoredKeysUnreadable>()(
  'StoredKeysUnreadable',
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return `Could not read the stored secret key ids: ${String(this.cause)}`;
  }
}

/**
 * Over a maintenance client released when the check ends, so the identity that
 * sees every team's rows is never held by a serving process.
 */
export const verifyKeyringOn = (
  config: DatabaseConfig,
): Effect.Effect<
  void,
  SecretKeyCheckError | StoredKeysUnreadable,
  Keyring | SecretsCipher
> =>
  verifyStoredKeys.pipe(
    Effect.provide(MaintenanceDatabase.layer(config)),
    Effect.catchTag('SqlError', (cause) => new StoredKeysUnreadable({ cause })),
  );

export const verifyKeyring: Effect.Effect<
  void,
  SecretKeyCheckError | StoredKeysUnreadable,
  Keyring | SecretsCipher | Environment
> = Effect.flatMap(Environment, (env) =>
  env.db === undefined
    ? Effect.void
    : verifyKeyringOn({
        url: env.db.url,
        applicationName: 'studio-secrets-check',
      }),
);

/**
 * Provides nothing: anything given it with `Layer.provide` is built after it,
 * so the check runs before serving.
 */
export const KeyringVerified: Layer.Layer<
  never,
  SecretKeyCheckError | StoredKeysUnreadable,
  Keyring | SecretsCipher | Environment
> = Layer.effectDiscard(verifyKeyring);
