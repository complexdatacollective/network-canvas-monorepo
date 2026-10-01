import { Effect, Layer, Option, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { type DatabaseConfig, MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope, type Transaction } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import type { SecretsCipherApi } from './cipher.ts';
import { isKeyId, type KeyringApi } from './keyring.ts';
import { Keyring, SecretsCipher } from './services.ts';
import { SECRET_STORES } from './stores.ts';

// The refusal that stands beside the schema fingerprint check (#1900): a
// deployment whose keyring cannot produce a key id already in the database is
// stopped before it serves anything. Without it a half-rotated keyring, or a
// database restored from a backup that does not match the keyring, comes up
// looking healthy and fails one webhook delivery or one sign-in at a time.
//
// Every statement runs inside one MAINTENANCE transaction: the tenant tables
// force row-level security, so any other role sees only the team its
// transaction named, and a check that saw one team's rows would pass while
// another team's key was missing. The database is reached only through
// `stores.ts`, whose spans each carry `sqlErrorsOnly`, so nothing here can
// publish a drizzle wrapper with a sealed bind parameter in its message.

/**
 * A stored key id that no keyring could ever hold, so nothing can open the row
 * it belongs to.
 *
 * Counted per table and never printed: these ids are read back out of stored
 * text, and a boot refusal is the thing most likely to be pasted into an
 * issue, so a column holding something else must not be a way to get arbitrary
 * stored bytes into a log. The count and the table are what an operator needs
 * to go and look.
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

/** Stored key ids the keyring does not carry. Well formed, so safe to name. */
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

/**
 * The keyring names the id but does not hold the key that was sealed under it
 * — a restore from the wrong backup, or a keyring regenerated with the same
 * ids. Every id is present, so the produce-check alone passed and the
 * deployment came up to fail one signature and one sign-in at a time.
 */
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

/** The three refusals, in the order the check tells them apart. */
export type SecretKeyCheckError =
  | SecretKeyIdMalformed
  | SecretKeyMissing
  | SecretKeyMaterial;

/**
 * Every distinct key id stored anywhere, across every store in the registry,
 * exactly as stored — including ids no keyring could hold, which the check
 * counts rather than names.
 */
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

/**
 * The check inside the caller's transaction. The last of its three steps
 * costs one decrypt per (store, key id) — a handful of statements at boot —
 * and is the only one that catches a keyring whose entries are all named
 * correctly.
 */
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
      // The opened value is discarded where it is produced, and the cipher's
      // own failure is deliberately not carried: it says only that a value did
      // not open, and what an operator has to act on is which key id is wrong.
      yield* Effect.try({
        try: () => {
          opener.value(cipher);
        },
        catch: () => new SecretKeyMaterial({ keyId }),
      });
    }
  }
});

/**
 * Refuses a database this keyring cannot read, in the order the faults have to
 * be told apart: ids nothing could open, then ids this keyring does not carry,
 * then ids it carries under the wrong key material.
 *
 * The keyring and the cipher are the process's own services, so the check
 * reads through exactly the key material the process will serve with. One
 * maintenance transaction for the whole check: the ids it counts and the rows
 * it probes are one reading of the database, and a fault that appeared between
 * two of its statements would otherwise be reported as something it is not.
 */
export const verifyStoredKeys: Effect.Effect<
  void,
  SecretKeyCheckError | SqlError.SqlError,
  Keyring | SecretsCipher | MaintenanceDatabase
> = Effect.fn('secrets.verify.verifyStoredKeys')(function* () {
  const keyring = yield* Keyring;
  const cipher = yield* SecretsCipher;
  yield* MaintenanceScope.open(checkStoredKeys(keyring, cipher));
})();

/**
 * The stored key ids could not be read at all: the check's client could not be
 * built, or one of its statements failed. The three refusals above keep their
 * own tags, so a boot reports whichever sentence applies.
 */
export class StoredKeysUnreadable extends Schema.TaggedError<StoredKeysUnreadable>()(
  'StoredKeysUnreadable',
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return `Could not read the stored secret key ids: ${String(this.cause)}`;
  }
}

/**
 * The check over a maintenance client built for it alone and released when it
 * ends: the one identity that sees every team's rows is never held by a
 * process that goes on to serve requests as the application role.
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

/**
 * The check against the process's own database, as the gate runs it. Nothing
 * to verify without a database.
 */
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
 * The boot gate: a layer that provides nothing and whose only effect is to
 * refuse. Anything given it with `Layer.provide` is built after it, which is
 * what makes "verified before it serves" a property of the graph rather than
 * of a call in the right place.
 */
export const KeyringVerified: Layer.Layer<
  never,
  SecretKeyCheckError | StoredKeysUnreadable,
  Keyring | SecretsCipher | Environment
> = Layer.effectDiscard(verifyKeyring);
