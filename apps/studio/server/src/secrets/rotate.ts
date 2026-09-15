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

  return counts;
}
