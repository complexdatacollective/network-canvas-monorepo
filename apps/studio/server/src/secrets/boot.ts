import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { Transaction } from '../db/tenant.ts';
import type { SecretsCipherApi } from './cipher.ts';
import { isKeyId, type KeyringApi } from './keyring.ts';
import { SECRET_STORES } from './stores.ts';

// The refusal that stands beside the schema fingerprint check (#1900): a
// deployment whose keyring cannot produce a key id already in the database is
// stopped before it serves anything. Without it a half-rotated keyring, or a
// database restored from a backup that does not match the keyring, comes up
// looking healthy and fails one webhook delivery or one sign-in at a time.
//
// The check itself is the whole of this module. The *gate* — the layer that
// refuses to build, and the print-and-exit wrapper the hand-run schema apply
// calls — lives in src/secrets/services.ts beside the keyring and the cipher
// it reads through, so there is one boot check rather than a service and a
// function that drifted apart.
//
// Every statement here runs inside the caller's transaction, which must be a
// MAINTENANCE one: the tenant tables force row-level security, so any other
// role sees only the team its transaction named, and a check that saw one
// team's rows would pass while another team's key was missing. The database is
// reached only through `stores.ts`, whose spans each carry `sqlErrorsOnly`, so
// nothing here can publish a drizzle wrapper with a sealed bind parameter in
// its message.

/** What every refusal from this check is, so one `catch` covers all three. */
export class SecretKeyCheckError extends Error {}

export class SecretKeyMissingError extends SecretKeyCheckError {
  constructor(missing: readonly string[]) {
    super(
      `Stored secrets use key id(s) the keyring cannot produce: ${missing.join(', ')}. ` +
        'Restore the entry to STUDIO_SECRETS_KEY / STUDIO_SECRETS_KEY_FILE, or ' +
        'restore the database backup that matches this keyring.',
    );
    this.name = 'SecretKeyMissingError';
  }
}

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
export class SecretKeyIdMalformedError extends SecretKeyCheckError {
  constructor(counts: readonly { store: string; count: number }[]) {
    super(
      `${counts
        .map(({ store, count }) =>
          count === 1
            ? `1 stored key id in ${store} is not a keyring id`
            : `${count} stored key ids in ${store} are not keyring ids`,
        )
        .join('; ')}. ` +
        'Nothing can open those rows. Restore the database backup that matches ' +
        'this keyring, or repair the rows before starting.',
    );
    this.name = 'SecretKeyIdMalformedError';
  }
}

/**
 * The keyring names the id but does not hold the key that was sealed under it
 * — a restore from the wrong backup, or a keyring regenerated with the same
 * ids. Every id is present, so the produce-check alone passed and the
 * deployment came up to fail one signature and one sign-in at a time.
 */
export class SecretKeyMaterialError extends SecretKeyCheckError {
  constructor(keyId: string) {
    super(
      `Key id "${keyId}" in the keyring does not open the stored secrets sealed under it; ` +
        'restore the keyring that matches this database.',
    );
    this.name = 'SecretKeyMaterialError';
  }
}

/**
 * Every distinct key id stored anywhere, across every store in the registry,
 * exactly as stored — including ids no keyring could hold, which
 * `assertSecretKeysProducible` counts rather than names.
 */
export const secretKeyIdsInUse: Effect.Effect<
  string[],
  SqlError.SqlError,
  Transaction
> = Effect.fn('secrets.boot.secretKeyIdsInUse')(function* () {
  const ids = new Set<string>();
  for (const store of SECRET_STORES) {
    for (const id of yield* store.keyIdsInUse) ids.add(id);
  }
  return [...ids].toSorted();
})();

/**
 * Refuses a database this keyring cannot read, in the order the faults have to
 * be told apart: ids nothing could open, then ids this keyring does not carry,
 * then ids it carries under the wrong key material.
 *
 * The last of those costs one decrypt per (store, key id) — a handful of
 * statements at boot — and is the only one of the three that catches a keyring
 * whose entries are all named correctly.
 *
 * The keyring and the cipher are both taken, and there is no default for
 * either: they must be the process's own pair (src/secrets/services.ts), and a
 * check that read through some other key material would answer a question
 * nobody asked. A cipher carries no way back to the keyring that made it — the
 * `has` the missing-id branch needs is the keyring's — so both are passed, by
 * the one caller that holds both as services.
 *
 * Reads several tables in ONE transaction, which the caller opens: the whole
 * check is a single reading of the database, and a fault that appeared between
 * two of its statements would otherwise be reported as something it is not.
 */
export const assertSecretKeysProducible: (
  keyring: KeyringApi,
  cipher: SecretsCipherApi,
) => Effect.Effect<void, SecretKeyCheckError | SqlError.SqlError, Transaction> =
  Effect.fn('secrets.boot.assertSecretKeysProducible')(function* (
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
      return yield* Effect.fail(new SecretKeyIdMalformedError(malformed));
    }

    const ids = [...inUse].toSorted();
    const missing = ids.filter((id) => !keyring.has(id));
    if (missing.length > 0) {
      return yield* Effect.fail(new SecretKeyMissingError(missing));
    }

    for (const store of SECRET_STORES) {
      for (const id of ids) {
        const open = yield* store.probe(id);
        if (open === null) continue;
        try {
          open(cipher);
        } catch {
          // Deliberately not chained: the cipher's message says only that a
          // value did not open, and what an operator has to act on is which
          // key id is wrong.
          return yield* Effect.fail(new SecretKeyMaterialError(id));
        }
      }
    }
  });
