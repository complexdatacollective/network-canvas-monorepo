import process from 'node:process';

import type pg from 'pg';

import { createMaintenancePool } from '../db/pool.ts';
import type { StudioEnv } from '../env.ts';
import { createSecretsCipher } from './cipher.ts';
import { isKeyId, type Keyring } from './keyring.ts';
import { SECRET_STORES } from './stores.ts';

// The refusal that stands beside the schema fingerprint check (#1900): a
// deployment whose keyring cannot produce a key id already in the database is
// stopped before it serves anything. Without it a half-rotated keyring, or a
// database restored from a backup that does not match the keyring, comes up
// looking healthy and fails one webhook delivery or one sign-in at a time.

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
export async function secretKeyIdsInUse(
  client: pg.PoolClient,
): Promise<string[]> {
  const ids = new Set<string>();
  for (const store of SECRET_STORES) {
    for (const id of await store.keyIdsInUse(client)) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Refuses a database this keyring cannot read, in the order the faults have to
 * be told apart: ids nothing could open, then ids this keyring does not carry,
 * then ids it carries under the wrong key material.
 *
 * The last of those costs one decrypt per (store, key id) — a handful of
 * statements at boot — and is the only one of the three that catches a keyring
 * whose entries are all named correctly.
 *
 * Takes a pool rather than a client so a caller does not have to know that the
 * check reads several tables in one session; it must be a MAINTENANCE pool,
 * which is the only identity that sees every team's rows.
 */
export async function assertSecretKeysProducible(
  pool: pg.Pool,
  keyring: Keyring,
): Promise<void> {
  const client = await pool.connect();
  try {
    const malformed: { store: string; count: number }[] = [];
    const inUse = new Set<string>();
    for (const store of SECRET_STORES) {
      let count = 0;
      for (const id of await store.keyIdsInUse(client)) {
        if (isKeyId(id)) inUse.add(id);
        else count += 1;
      }
      if (count > 0) malformed.push({ store: store.name, count });
    }
    if (malformed.length > 0) throw new SecretKeyIdMalformedError(malformed);

    const ids = [...inUse].sort();
    const missing = ids.filter((id) => !keyring.has(id));
    if (missing.length > 0) throw new SecretKeyMissingError(missing);

    const cipher = createSecretsCipher(keyring);
    for (const store of SECRET_STORES) {
      for (const id of ids) {
        const open = await store.probe(client, id);
        if (open === null) continue;
        try {
          open(cipher);
        } catch {
          // Deliberately not chained: the cipher's message says only that a
          // value did not open, and what an operator has to act on is which
          // key id is wrong.
          throw new SecretKeyMaterialError(id);
        }
      }
    }
  } finally {
    client.release();
  }
}

/**
 * What both entrypoints call once the schema is current — and what
 * `apply-schema` calls once it has applied one — in every lane, development
 * included: prints and exits rather than throwing, because there is nothing
 * above a boot to catch it and a stack trace would bury the one sentence that
 * says what to do.
 *
 * Resolves only when every stored key id is well formed, is in the keyring,
 * and opens a row that was sealed under it.
 *
 * @param pool a maintenance pool the caller already owns (the worker's). The
 * web process runs as the application role, which row-level security shows
 * only one team at a time, so with none given this opens a maintenance pool
 * for the check and ends it again — the check is a handful of statements at
 * boot, and holding a second pool for the life of the process would be a
 * cross-team identity sitting in the process that serves requests.
 */
export async function verifySecretKeysOrExit(
  env: StudioEnv,
  pool?: pg.Pool,
): Promise<void> {
  const { db, secrets } = env;
  if (!db) return;

  const refuse = (message: string): never => {
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.error(message);
    process.exit(1);
  };

  if (!secrets) {
    // `resolve` already refuses a database with no keyring, so this is the
    // belt to that braces: a lane that ever reached here without one would be
    // about to write secrets it could not read back.
    refuse(
      'No secrets keyring is configured; set STUDIO_SECRETS_KEY_FILE or STUDIO_SECRETS_KEY.',
    );
    return;
  }

  const owned = pool ?? createMaintenancePool(db);
  try {
    await assertSecretKeysProducible(owned, secrets);
  } catch (error) {
    refuse(
      error instanceof SecretKeyCheckError
        ? error.message
        : `Could not read the stored secret key ids: ${String(error)}`,
    );
  } finally {
    if (!pool) await owned.end();
  }
}
