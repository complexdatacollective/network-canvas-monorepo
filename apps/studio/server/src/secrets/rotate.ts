import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import {
  assertSecretKeysProducible,
  type SecretKeyCheckError,
} from './boot.ts';
import { Keyring, SecretsCipher } from './services.ts';
import { SECRET_STORES } from './stores.ts';

// `studio-api rotate-secrets` (#1900): re-encrypt every stored secret under
// the keyring's current entry. A rotation is a deploy of a longer keyring
// followed by this command followed by a deploy that drops the old entry, and
// the command is what makes the last of those three safe.
//
// Deliberately without a timer or a trigger. The number of secrets is small,
// and a self-hoster should never start writing under a key they have not
// backed up — so re-keying is something a person does, having decided to.
//
// Every transaction is a MAINTENANCE one and each is opened at the ROOT of the
// fiber, never inside another: the tenant tables force row-level security, so
// any other identity would silently rotate one team's rows and leave the rest
// pinned to a key about to be removed — and a scope opened inside a scope is a
// `SAVEPOINT effect_sql_<depth>` that `SqlClient` never releases on success,
// so a batch of a hundred rows would leave a hundred subtransactions standing.

const DEFAULT_BATCH_SIZE = 100;

export type RotationCounts = Record<string, number>;

/**
 * Rows that are still not under the current key once the loop has stopped.
 *
 * The loop cannot prove it is done: `FOR UPDATE SKIP LOCKED` steps over a row
 * another session holds, so that batch returns zero — which is also how a
 * finished store reports itself. Believing it let the command print "every
 * stored secret is now under key id …" with rows still sealed under the entry
 * the operator was about to remove from the keyring.
 */
export class RotationIncomplete extends Schema.TaggedError<RotationIncomplete>()(
  'RotationIncomplete',
  {
    remaining: Schema.Array(
      Schema.Struct({ store: Schema.String, rows: Schema.Number }),
    ),
  },
) {
  override get message(): string {
    return (
      `${this.remaining
        .map(
          ({ store, rows }) =>
            `${store}: ${rows} row${rows === 1 ? '' : 's'} still under another key (held by another session, or written under an older key while this ran)`,
        )
        .join('; ')}; run rotate-secrets again once the other session has ` +
      'finished, and before removing the old entry from the keyring.'
    );
  }
}

export type RotateSecretsOptions = {
  /** Rows per transaction. Small enough that no batch holds locks for long. */
  readonly batchSize?: number | undefined;
  /** Progress, once a batch is committed; the CLI prints it. */
  readonly log?: ((message: string) => Effect.Effect<void>) | undefined;
};

/**
 * Idempotent — a second run finds nothing to do and reports zeros — and
 * resumable, because each batch is its own transaction: a run killed halfway
 * leaves the batches it committed rotated, and a rerun finishes the rest.
 *
 * Succeeds only when every store has been PROVED empty of rows under an older
 * key; otherwise it fails with `RotationIncomplete`, leaving everything it did
 * commit committed.
 *
 * A batch size that could never finish is a DEFECT rather than a failure: it
 * comes from the call site rather than from the database, and there is nothing
 * an operator could do with it that is not "fix the caller" — the same reading
 * `db/tenant.ts` gives an isolation level asked for inside a transaction.
 */
export const rotateSecrets: (
  options?: RotateSecretsOptions,
) => Effect.Effect<
  RotationCounts,
  SecretKeyCheckError | RotationIncomplete | SqlError.SqlError,
  Keyring | SecretsCipher | MaintenanceDatabase
> = Effect.fn('secrets.rotate.rotateSecrets')(function* (
  options: RotateSecretsOptions = {},
) {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    return yield* Effect.die(
      new Error(`batchSize must be a positive integer, not ${batchSize}`),
    );
  }

  const keyring = yield* Keyring;
  const cipher = yield* SecretsCipher;

  // Before anything is written: a keyring missing a key that rows are stored
  // under can re-seal some rows and not others, and a partial rotation is the
  // state this command exists to get a deployment out of, not into. Its own
  // transaction, so nothing it read is held open across the batches.
  yield* MaintenanceScope.open(assertSecretKeysProducible(keyring, cipher));

  const counts: RotationCounts = {};

  for (const store of SECRET_STORES) {
    let rotated = 0;
    for (;;) {
      const batch = yield* MaintenanceScope.open(
        store.rotateBatch(cipher, batchSize),
      );
      if (batch === 0) break;
      rotated += batch;
      // After the commit, never before: a log that dies (or a process killed
      // between batches) must not be able to lose work that is already durable.
      if (options.log !== undefined) {
        yield* options.log(
          `${store.name}: ${rotated} re-sealed under ${cipher.currentKeyId}`,
        );
      }
    }
    counts[store.name] = rotated;
  }

  // The postcondition, after every store: counted rather than inferred from
  // the loop ending, and reported together so one rerun can be scheduled for
  // everything that is behind. One transaction across all three stores, so the
  // counts are one reading of the database rather than three.
  const remaining = yield* MaintenanceScope.open(
    Effect.fnUntraced(function* () {
      const behind: { store: string; rows: number }[] = [];
      for (const store of SECRET_STORES) {
        const rows = yield* store.remaining(cipher.currentKeyId);
        if (rows > 0) behind.push({ store: store.name, rows });
      }
      return behind;
    })(),
  );
  if (remaining.length > 0) return yield* new RotationIncomplete({ remaining });

  return counts;
});
