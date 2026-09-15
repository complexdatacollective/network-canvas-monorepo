import process from 'node:process';

import type pg from 'pg';

import { createMaintenancePool } from '../db/pool.ts';
import type { StudioEnv } from '../env.ts';
import type { Keyring } from './keyring.ts';
import { SECRET_STORES } from './stores.ts';

// The refusal that stands beside the schema fingerprint check (#1900): a
// deployment whose keyring cannot produce a key id already in the database is
// stopped before it serves anything. Without it a half-rotated keyring, or a
// database restored from a backup that does not match the keyring, comes up
// looking healthy and fails one webhook delivery or one sign-in at a time.

export class SecretKeyMissingError extends Error {
  constructor(missing: readonly string[]) {
    super(
      `Stored secrets use key id(s) the keyring cannot produce: ${missing.join(', ')}. ` +
        'Restore the entry to STUDIO_SECRETS_KEY / STUDIO_SECRETS_KEY_FILE, or ' +
        'restore the database backup that matches this keyring.',
    );
    this.name = 'SecretKeyMissingError';
  }
}

/** Every distinct key id stored anywhere, across every store in the registry. */
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
 * Throws `SecretKeyMissingError` naming every id the keyring cannot produce.
 * Takes a pool rather than a client so a caller does not have to know that the
 * check reads several tables in one session; it must be a MAINTENANCE pool,
 * which is the only identity that sees every team's rows.
 */
export async function assertSecretKeysProducible(
  pool: pg.Pool,
  keyring: Keyring,
): Promise<void> {
  const client = await pool.connect();
  let inUse: string[];
  try {
    inUse = await secretKeyIdsInUse(client);
  } finally {
    client.release();
  }
  const missing = inUse.filter((id) => !keyring.has(id));
  if (missing.length > 0) throw new SecretKeyMissingError(missing);
}

/**
 * What both entrypoints call once the schema is current — and what
 * `apply-schema` calls once it has applied one — in every lane, development
 * included: prints and exits rather than throwing, because there is nothing
 * above a boot to catch it and a stack trace would bury the one sentence that
 * says what to do.
 *
 * Resolves only when every stored key id can be produced.
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
      error instanceof SecretKeyMissingError
        ? error.message
        : `Could not read the stored secret key ids: ${String(error)}`,
    );
  } finally {
    if (!pool) await owned.end();
  }
}
