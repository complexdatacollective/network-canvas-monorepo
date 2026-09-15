import type pg from 'pg';

import { assertSecretKeysProducible } from './boot.ts';
import { createSecretsCipher } from './cipher.ts';
import type { Keyring } from './keyring.ts';
import { SECRET_STORES } from './stores.ts';

// `studio-api rotate-secrets` (#1900): re-encrypt every stored secret under
// the keyring's current entry. A rotation is a deploy of a longer keyring
// followed by this command followed by a deploy that drops the old entry, and
// the command is what makes the last of those three safe.
//
// Deliberately without a timer or a trigger. The number of secrets is small,
// and a self-hoster should never start writing under a key they have not
// backed up — so re-keying is something a person does, having decided to.

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
export class RotationIncompleteError extends Error {
  constructor(remaining: readonly { store: string; rows: number }[]) {
    super(
      `${remaining
        .map(
          ({ store, rows }) =>
            `${store}: ${rows} row${rows === 1 ? '' : 's'} still under another key (held by another session)`,
        )
        .join('; ')}; run rotate-secrets again once the other session has ` +
        'finished, and before removing the old entry from the keyring.',
    );
    this.name = 'RotationIncompleteError';
  }
}

export type RotateSecretsOptions = {
  /** Rows per transaction. Small enough that no batch holds locks for long. */
  batchSize?: number;
  /** Progress, once a batch is committed; the CLI prints it. */
  log?: (message: string) => void;
};

async function inTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Idempotent — a second run finds nothing to do and reports zeros — and
 * resumable, because each batch is its own transaction: a run killed halfway
 * leaves the batches it committed rotated, and a rerun finishes the rest.
 *
 * Resolves only when every store has been PROVED empty of rows under an older
 * key; otherwise it rejects with `RotationIncompleteError`, leaving everything
 * it did commit committed.
 *
 * @param pool must run as the MAINTENANCE role: the tenant tables force
 * row-level security, and any other identity would silently rotate one team's
 * rows and leave the rest pinned to a key about to be removed.
 */
export async function rotateSecrets(
  pool: pg.Pool,
  keyring: Keyring,
  { batchSize = DEFAULT_BATCH_SIZE, log }: RotateSecretsOptions = {},
): Promise<RotationCounts> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`batchSize must be a positive integer, not ${batchSize}`);
  }

  // Before anything is written: a keyring missing a key that rows are stored
  // under can re-seal some rows and not others, and a partial rotation is the
  // state this command exists to get a deployment out of, not into.
  await assertSecretKeysProducible(pool, keyring);

  const cipher = createSecretsCipher(keyring);
  const counts: RotationCounts = {};

  for (const store of SECRET_STORES) {
    let rotated = 0;
    for (;;) {
      const batch = await inTransaction(pool, (client) =>
        store.rotateBatch(client, cipher, batchSize),
      );
      if (batch === 0) break;
      rotated += batch;
      // After the commit, never before: a log that throws (or a process killed
      // between batches) must not be able to lose work that is already durable.
      log?.(`${store.name}: ${rotated} re-sealed under ${cipher.currentKeyId}`);
    }
    counts[store.name] = rotated;
  }

  // The postcondition, after every store: counted rather than inferred from
  // the loop ending, and reported together so one rerun can be scheduled for
  // everything that is behind.
  const remaining: { store: string; rows: number }[] = [];
  const client = await pool.connect();
  try {
    for (const store of SECRET_STORES) {
      const rows = await store.remaining(client, cipher.currentKeyId);
      if (rows > 0) remaining.push({ store: store.name, rows });
    }
  } finally {
    client.release();
  }
  if (remaining.length > 0) throw new RotationIncompleteError(remaining);

  return counts;
}
