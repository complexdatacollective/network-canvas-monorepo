import { createHmac, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';

import {
  type EncryptionKeys,
  type KeyPurpose,
  loadEncryptionKeys,
  type RootKeyLoader,
} from './keys.ts';
import {
  CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
  RAW_LEGACY_CONTACT_INDEX_ID,
  RAW_LEGACY_PARTICIPANT_INDEX_ID,
  verifyLegacyIndexRemediationTransaction,
} from './legacy-indexes.ts';

const PURPOSES = ['pii-enc', 'integration-enc', 'pii-index'] as const;
const KEY_REGISTRY_LOCK = 4021775688147141;

export class EncryptionStartupError extends Error {
  constructor() {
    super(
      'Encryption key verification failed. Restore the matching keyset or complete the offline credential migration before starting Studio.',
    );
    this.name = 'EncryptionStartupError';
  }
}

function keyProof(keys: EncryptionKeys, purpose: KeyPurpose, keyId: string) {
  return createHmac('sha256', keys.derive(purpose, keyId, ['key-verification']))
    .update('studio-key-verification.v1')
    .digest();
}

type KeyReference = { purpose: KeyPurpose; keyId: string };

const STORED_KEY_REFERENCES_SQL = `
  SELECT DISTINCT 'pii-enc' AS purpose, pii_key_id AS "keyId"
    FROM participants WHERE pii_key_id IS NOT NULL
  UNION SELECT 'pii-index', blind_index_key_id FROM participants WHERE blind_index_key_id IS NOT NULL
  UNION SELECT 'pii-index', blind_index_key_id FROM message_deliveries
  UNION SELECT 'pii-index', blind_index_key_id FROM participant_contact_optouts
  UNION SELECT 'integration-enc', secret_key_id FROM webhook_subscriptions
  UNION SELECT 'integration-enc', access_token_key_id FROM account WHERE access_token_key_id IS NOT NULL
  UNION SELECT 'integration-enc', refresh_token_key_id FROM account WHERE refresh_token_key_id IS NOT NULL
  UNION SELECT 'integration-enc', id_token_key_id FROM account WHERE id_token_key_id IS NOT NULL`;

/** Proof verification never registers a key or scans participant/credential rows. */
async function verifyExistingProofs(
  client: pg.PoolClient,
  keys: EncryptionKeys,
): Promise<Set<string>> {
  // Refuse an accidentally supplied app pool even when this database has
  // no tenant rows yet: it would see only a subset on the next restart.
  const role = await client.query<{ role: string }>(
    'SELECT current_user AS role',
  );
  if (role.rows[0]?.role !== 'studio_maintenance')
    throw new EncryptionStartupError();
  const proofs = await client.query<KeyReference & { proof: Buffer }>(
    'SELECT purpose, key_id AS "keyId", proof FROM encryption_key_verifications',
  );
  const knownProofs = new Set<string>();
  for (const { purpose, keyId, proof } of proofs.rows) {
    if (!PURPOSES.includes(purpose) || !keys.has(purpose, keyId))
      throw new EncryptionStartupError();
    const expected = keyProof(keys, purpose, keyId);
    if (proof.length !== expected.length || !timingSafeEqual(proof, expected))
      throw new EncryptionStartupError();
    knownProofs.add(JSON.stringify([purpose, keyId]));
  }
  return knownProofs;
}

/** Internal transaction seam shared by startup and the explicit demo seeder. */
export async function verifyEncryptionKeyTransaction(
  client: pg.PoolClient,
  keys: EncryptionKeys,
  allowLegacyCredentials: boolean,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [KEY_REGISTRY_LOCK]);
  if (!allowLegacyCredentials)
    await verifyLegacyIndexRemediationTransaction(client);
  const knownProofs = await verifyExistingProofs(client, keys);
  const references = await client.query<KeyReference>(
    STORED_KEY_REFERENCES_SQL,
  );
  const legacyPii = allowLegacyCredentials
    ? await client.query<{ keyId: string }>(
        `SELECT pii_key_id AS "keyId" FROM participants
         WHERE pii_key_id IS NOT NULL GROUP BY pii_key_id
         HAVING bool_and(blind_index_key_id = $1)`,
        [RAW_LEGACY_PARTICIPANT_INDEX_ID],
      )
    : { rows: [] as { keyId: string }[] };
  const unverifiedLegacyPiiIds = new Set(
    legacyPii.rows
      .map(({ keyId }) => keyId)
      .filter((keyId) => !knownProofs.has(JSON.stringify(['pii-enc', keyId]))),
  );
  if (unverifiedLegacyPiiIds.has(keys.currentId('pii-enc')))
    throw new EncryptionStartupError();
  for (const { purpose, keyId } of references.rows) {
    const permittedLegacyIndex =
      purpose === 'pii-index' &&
      (keyId === CLASSIFIED_LEGACY_CONTACT_INDEX_ID ||
        (allowLegacyCredentials &&
          (keyId === RAW_LEGACY_CONTACT_INDEX_ID ||
            keyId === RAW_LEGACY_PARTICIPANT_INDEX_ID)));
    if (
      !permittedLegacyIndex &&
      (!keys.has(purpose, keyId) ||
        (!knownProofs.has(JSON.stringify([purpose, keyId])) &&
          !(purpose === 'pii-enc' && unverifiedLegacyPiiIds.has(keyId))))
    )
      throw new EncryptionStartupError();
  }
  if (!allowLegacyCredentials) {
    const legacy = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM account WHERE legacy_tokens_present) AS exists`,
    );
    if (legacy.rows[0]?.exists) throw new EncryptionStartupError();
  }
  for (const purpose of PURPOSES) {
    for (const keyId of keys.ids(purpose)) {
      if (knownProofs.has(JSON.stringify([purpose, keyId]))) continue;
      if (purpose === 'pii-enc' && unverifiedLegacyPiiIds.has(keyId)) continue;
      await client.query(
        'INSERT INTO encryption_key_verifications (purpose, key_id, proof) VALUES ($1, $2, $3)',
        [purpose, keyId, keyProof(keys, purpose, keyId)],
      );
    }
  }
}

/**
 * Called only after AEAD authentication of a legacy participant row, in the
 * same audited transaction that replaces every ciphertext and blind index.
 */
export async function registerAuthenticatedLegacyKeyProofTransaction(
  client: pg.PoolClient,
  keys: EncryptionKeys,
  keyId: string,
): Promise<void> {
  if (!keys.has('pii-enc', keyId)) throw new EncryptionStartupError();
  const proof = keyProof(keys, 'pii-enc', keyId);
  const existing = await client.query<{ proof: Buffer }>(
    `SELECT proof FROM encryption_key_verifications
     WHERE purpose = 'pii-enc' AND key_id = $1`,
    [keyId],
  );
  const stored = existing.rows[0]?.proof;
  if (stored) {
    if (stored.length !== proof.length || !timingSafeEqual(stored, proof))
      throw new EncryptionStartupError();
    return;
  }
  await client.query(
    `INSERT INTO encryption_key_verifications (purpose, key_id, proof)
     VALUES ('pii-enc', $1, $2)`,
    [keyId, proof],
  );
}

/**
 * Called with the maintenance pool: a team-scoped scan cannot verify the
 * complete restore. Proofs are write-once; startup never blesses a missing
 * proof for an ID already referenced by ciphertext or a blind index.
 */
async function verifyKeys(
  pool: pg.Pool,
  keys: EncryptionKeys,
  operation: 'startup' | 'legacy' | 'resume',
): Promise<void> {
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (operation === 'resume') {
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        KEY_REGISTRY_LOCK,
      ]);
      const proofs = await verifyExistingProofs(client, keys);
      for (const purpose of PURPOSES) {
        for (const keyId of keys.ids(purpose)) {
          if (!proofs.has(JSON.stringify([purpose, keyId])))
            throw new EncryptionStartupError();
        }
      }
    } else {
      await verifyEncryptionKeyTransaction(
        client,
        keys,
        operation === 'legacy',
      );
    }
    await client.query('COMMIT');
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    // Database/provider errors can include bound values. Boot reports only
    // this fixed diagnostic, never a key, address, token, or raw SQL error.
    throw new EncryptionStartupError();
  } finally {
    client?.release();
  }
}

export type EncryptionInitialization = {
  maintenancePool: pg.Pool;
  configuration: unknown;
  loadRootKey: RootKeyLoader;
};

/** Fatal boot gate, after schema validation and before auth/workers/traffic. */
export async function initializeEncryption(
  input: EncryptionInitialization,
): Promise<EncryptionKeys> {
  const keys = await loadEncryptionKeys(input.configuration, input.loadRootKey);
  await verifyKeys(input.maintenancePool, keys, 'startup');
  return keys;
}

/** Offline operator migration only; all existing key proofs still apply. */
export async function initializeCredentialMigration(
  input: EncryptionInitialization,
): Promise<EncryptionKeys> {
  const keys = await loadEncryptionKeys(input.configuration, input.loadRootKey);
  await verifyKeys(input.maintenancePool, keys, 'legacy');
  return keys;
}

/**
 * Resume only after the first batch's complete verification. Immutable proofs
 * still require every historical root, but no corpus scan or registration is
 * repeated. This is not the startup/restore/retirement verification gate.
 */
export async function resumeEncryptionMaintenance(
  input: EncryptionInitialization,
): Promise<EncryptionKeys> {
  const keys = await loadEncryptionKeys(input.configuration, input.loadRootKey);
  await verifyKeys(input.maintenancePool, keys, 'resume');
  return keys;
}
