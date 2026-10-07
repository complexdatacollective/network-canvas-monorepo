import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import type { MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import { type Keyring, SecretsCipher } from './services.ts';
import { SECRET_STORES } from './stores.ts';
import { type SecretKeyCheckError, verifyStoredKeys } from './verify.ts';

// Every transaction is opened at the ROOT of the fiber: a scope inside a scope
// is a `SAVEPOINT` that `SqlClient` never releases on success.

const DEFAULT_BATCH_SIZE = 100;

export type RotationCounts = Record<string, number>;

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
  readonly batchSize?: number | undefined;
};

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

  const cipher = yield* SecretsCipher;

  // Before anything is written, so an incomplete keyring rotates nothing rather
  // than some.
  yield* verifyStoredKeys;

  const counts: RotationCounts = {};

  for (const store of SECRET_STORES) {
    let rotated = 0;
    for (;;) {
      const batch = yield* MaintenanceScope.open(store.rotateBatch(batchSize));
      if (batch === 0) break;
      rotated += batch;
      // After the commit, never before.
      yield* Effect.logInfo(
        `${store.name}: ${rotated} re-sealed under ${cipher.currentKeyId}`,
      );
    }
    counts[store.name] = rotated;
  }

  // Counted rather than inferred from the loop ending: `FOR UPDATE SKIP LOCKED`
  // makes a batch over held rows return zero.
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
