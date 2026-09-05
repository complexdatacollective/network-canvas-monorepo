import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { EncryptionKeys } from './keys.ts';
import {
  createDataProtection,
  type IntegrationField,
  ProtectedDataError,
} from './protection.ts';

export const OAUTH_FIELDS = [
  {
    field: 'accessToken',
    ciphertext: 'access_token_ciphertext',
    keyId: 'accessTokenKeyId',
    keyColumn: 'access_token_key_id',
    algorithm: 'accessTokenAlgorithm',
    algorithmColumn: 'access_token_algorithm',
  },
  {
    field: 'refreshToken',
    ciphertext: 'refresh_token_ciphertext',
    keyId: 'refreshTokenKeyId',
    keyColumn: 'refresh_token_key_id',
    algorithm: 'refreshTokenAlgorithm',
    algorithmColumn: 'refresh_token_algorithm',
  },
  {
    field: 'idToken',
    ciphertext: 'id_token_ciphertext',
    keyId: 'idTokenKeyId',
    keyColumn: 'id_token_key_id',
    algorithm: 'idTokenAlgorithm',
    algorithmColumn: 'id_token_algorithm',
  },
] as const;

export type OAuthIdentity = { id: string; userId: string };

/** Runtime identity, not a caller-supplied authorization flag. */
async function requireCredentialRole(
  client: pg.PoolClient,
  maintenanceOnly = false,
): Promise<void> {
  const role = await client.query<{ role: string }>(
    'SELECT current_user AS role',
  );
  if (
    role.rows[0]?.role !== 'studio_maintenance' &&
    (maintenanceOnly || role.rows[0]?.role !== 'studio_app')
  )
    throw new ProtectedDataError();
}

export async function appendCredentialAudit(
  client: pg.PoolClient,
  identity: OAuthIdentity,
  action: 'read' | 'write' | 'rotate' | 'migrate_legacy',
  requestId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO credential_audit_events (id, user_id, account_id, action, outcome, request_id) VALUES ($1, $2, $3, $4, 'succeeded', $5)`,
    [randomUUID(), identity.userId, identity.id, action, requestId],
  );
}

export async function credentialTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
  maintenanceOnly = false,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await requireCredentialRole(client, maintenanceOnly);
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

/** Encrypts only supplied fields; omitted tokens retain their own key metadata. */
export function sealOAuthFields(
  keys: EncryptionKeys,
  identity: OAuthIdentity,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...input };
  const protection = createDataProtection(keys, {
    participant: async () => {
      throw new ProtectedDataError();
    },
    integration: async () => {
      throw new ProtectedDataError();
    },
  });
  for (const spec of OAUTH_FIELDS) {
    if (!(spec.field in input)) continue;
    const value = input[spec.field];
    if (value === undefined) continue;
    if (value === null) {
      result[spec.keyId] = null;
      result[spec.algorithm] = null;
    } else {
      if (typeof value !== 'string' || Buffer.byteLength(value) > 65_536)
        throw new ProtectedDataError();
      const sealed = protection.encryptIntegration(
        {
          kind: 'oauth',
          userId: identity.userId,
          accountId: identity.id,
          column: spec.field,
        },
        Buffer.from(value),
      );
      result[spec.field] = sealed.envelope;
      result[spec.keyId] = sealed.keyId;
      result[spec.algorithm] = sealed.algorithm;
    }
  }
  return result;
}

/**
 * Only the Better Auth adapter and offline rotation call this identity-bound
 * store. Better Auth authorizes account identity during sign-in/session use;
 * the locked recheck binds that exact identity and ciphertext to the audit.
 * OAuth has no authoritative team, so the immutable global log is deliberate.
 */
export async function readOAuthFields<T>(
  pool: pg.Pool,
  keys: EncryptionKeys | undefined,
  row: T,
  selected?: readonly string[],
): Promise<T> {
  if (row === null || typeof row !== 'object') throw new ProtectedDataError();
  const record: Record<string, unknown> = {};
  Object.assign(record, row);
  const identity = { id: record.id, userId: record.userId };
  if (typeof identity.id !== 'string' || typeof identity.userId !== 'string')
    throw new ProtectedDataError();
  const updates: Record<string, unknown> = {};
  for (const spec of OAUTH_FIELDS) {
    const ciphertext = record[spec.field];
    if (selected && !selected.includes(spec.field)) continue;
    if (ciphertext === null || ciphertext === undefined) continue;
    const keyId = record[spec.keyId];
    const algorithm = record[spec.algorithm];
    if (
      !keys ||
      !Buffer.isBuffer(ciphertext) ||
      typeof keyId !== 'string' ||
      typeof algorithm !== 'string'
    )
      throw new ProtectedDataError();
    const bound: OAuthIdentity = { id: identity.id, userId: identity.userId };
    const target: IntegrationField = {
      kind: 'oauth',
      userId: bound.userId,
      accountId: bound.id,
      column: spec.field,
    };
    const protection = createDataProtection(keys, {
      participant: async () => {
        throw new ProtectedDataError();
      },
      integration: async (_target, read) => {
        await credentialTransaction(pool, async (client) => {
          const current = await client.query<{
            ciphertext: Buffer | null;
            key_id: string | null;
            algorithm: string | null;
          }>(
            `SELECT ${spec.ciphertext} AS ciphertext, ${spec.keyColumn} AS key_id, ${spec.algorithmColumn} AS algorithm FROM account WHERE id = $1 AND "userId" = $2 FOR UPDATE`,
            [bound.id, bound.userId],
          );
          const stored = current.rows[0];
          if (
            !stored ||
            stored.key_id !== keyId ||
            stored.algorithm !== algorithm ||
            !stored.ciphertext?.equals(ciphertext)
          )
            throw new ProtectedDataError();
          read();
          await appendCredentialAudit(client, bound, 'read', randomUUID());
        });
      },
    });
    const plaintext = await protection.readIntegration(target, {
      keyId,
      algorithm,
      envelope: ciphertext,
    });
    updates[spec.field] = plaintext.toString('utf8');
    plaintext.fill(0);
  }
  const result = Object.assign({}, row, updates);
  // Ciphertext metadata is internal storage, never Better Auth's public model.
  for (const spec of OAUTH_FIELDS) {
    Reflect.deleteProperty(result, spec.keyId);
    Reflect.deleteProperty(result, spec.algorithm);
  }
  if (selected) {
    for (const name of Object.keys(result))
      if (!selected.includes(name)) Reflect.deleteProperty(result, name);
  }
  return result;
}
