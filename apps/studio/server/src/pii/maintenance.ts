import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  runAuditedSystemMutation,
  type SystemAuditEventContext,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { createContactBlindIndex } from './contacts.ts';
import { registerAuthenticatedLegacyKeyProofTransaction } from './initialize.ts';
import type { EncryptionKeys } from './keys.ts';
import {
  classifyLegacyContactIndexBatch,
  RAW_LEGACY_PARTICIPANT_INDEX_ID,
} from './legacy-indexes.ts';
import {
  appendCredentialAudit,
  credentialTransaction,
  OAUTH_FIELDS,
  readOAuthFields,
  sealOAuthFields,
} from './oauth.ts';
import {
  PARTICIPANT_PII_COLUMNS,
  type ParticipantCiphertextRow,
  selectParticipantCiphertext,
} from './participants.ts';
import {
  createDataProtection,
  type ParticipantField,
  ProtectedDataError,
} from './protection.ts';
import {
  readWebhookSecret,
  selectWebhookCiphertext,
  type WebhookCiphertextRow,
} from './webhooks.ts';

const limitSchema = z.number().int().min(1).max(100);
const PHASES = ['participants', 'webhooks', 'oauth'] as const;
const cursorSchema = z.strictObject({
  phase: z.enum(PHASES),
  afterId: z.string().min(1).max(255).nullable(),
  piiKeyId: z.string(),
  integrationKeyId: z.string(),
});
export type RotationCursor = z.infer<typeof cursorSchema>;

export function parseRotationCursor(value: unknown): RotationCursor {
  const cursor = cursorSchema.parse(value);
  if (cursor.afterId !== null && cursor.phase !== 'oauth')
    z.uuid().parse(cursor.afterId);
  return cursor;
}

export function parseLegacyCursor(value: unknown): string | null {
  return z.string().min(1).max(255).nullable().parse(value);
}

function sameBytes(left: Buffer | null, right: Buffer | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function sameParticipant(
  left: ParticipantCiphertextRow,
  right: ParticipantCiphertextRow,
): boolean {
  return (
    left.pii_key_id === right.pii_key_id &&
    left.pii_algorithm === right.pii_algorithm &&
    PARTICIPANT_PII_COLUMNS.every((column) =>
      sameBytes(left[column], right[column]),
    )
  );
}

function participantEvent(
  context: SystemAuditEventContext<'Encryption maintenance'>,
  row: ParticipantCiphertextRow,
  eventType: 'participant.pii.rotation_read' | 'participant.pii.rotated',
  columns: ParticipantField['column'][],
): AuditEventInput {
  return {
    ...context,
    eventType,
    eventVersion: 1,
    category: 'participant_data',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'participant',
    resourceId: row.id,
    resourceLabel: row.participant_code,
    details: { studyId: row.study_id, columns },
  };
}

async function rotateParticipant(
  pool: pg.Pool,
  keys: EncryptionKeys,
  row: ParticipantCiphertextRow,
): Promise<void> {
  if (!row.pii_key_id || !row.pii_algorithm) throw new ProtectedDataError();
  const tenant = createTenantDb(pool, row.team_id);
  const command = {
    tenantDb: tenant,
    actorLabel: 'Encryption maintenance',
    requestId: randomUUID(),
  } as const;
  const target = {
    teamId: row.team_id,
    studyId: row.study_id,
    participantId: row.id,
  };
  const protection = createDataProtection(keys, {
    participant: async (field, read) => {
      await runAuditedSystemMutation(command, async (client, context) => {
        const current = await selectParticipantCiphertext(
          client,
          row.team_id,
          target,
          true,
        );
        if (!current || !sameParticipant(row, current))
          throw new ProtectedDataError();
        read();
        return {
          result: undefined,
          events: [
            participantEvent(context, row, 'participant.pii.rotation_read', [
              field.column,
            ]),
          ],
        };
      });
    },
    integration: async () => {
      throw new ProtectedDataError();
    },
  });
  const rowKeyId = keys.currentId('pii-enc');
  const ciphertexts: (Buffer | null)[] = [];
  for (const column of PARTICIPANT_PII_COLUMNS) {
    const stored = row[column];
    if (stored === null) {
      ciphertexts.push(null);
      continue;
    }
    const field = { ...target, column };
    const plaintext = await protection.readParticipant(field, {
      keyId: row.pii_key_id,
      algorithm: row.pii_algorithm,
      envelope: stored,
    });
    try {
      ciphertexts.push(
        protection.encryptParticipant(field, plaintext, rowKeyId).envelope,
      );
    } finally {
      plaintext.fill(0);
    }
  }
  await runAuditedSystemMutation(command, async (client, context) => {
    const current = await selectParticipantCiphertext(
      client,
      row.team_id,
      target,
      true,
    );
    if (!current || !sameParticipant(row, current))
      throw new ProtectedDataError();
    // Blind indexes and their independently versioned key are left byte-for-
    // byte unchanged. Ciphertext rotation never invalidates suppression.
    await client.query(
      'UPDATE participants SET email_ciphertext = $3, phone_ciphertext = $4, name_ciphertext = $5, attributes_ciphertext = $6, pii_key_id = $7, pii_algorithm = $8 WHERE id = $1 AND team_id = $2',
      [row.id, row.team_id, ...ciphertexts, rowKeyId, 'aes-256-gcm.v1'],
    );
    return {
      result: undefined,
      events: [
        participantEvent(context, row, 'participant.pii.rotated', [
          ...PARTICIPANT_PII_COLUMNS,
        ]),
      ],
    };
  });
}

type LegacyParticipantRow = ParticipantCiphertextRow & {
  email_index: Buffer | null;
  phone_index: Buffer | null;
  blind_index_key_id: string | null;
};

function sameLegacyParticipant(
  left: LegacyParticipantRow,
  right: LegacyParticipantRow,
): boolean {
  return (
    sameParticipant(left, right) &&
    sameBytes(left.email_index, right.email_index) &&
    sameBytes(left.phone_index, right.phone_index) &&
    left.blind_index_key_id === right.blind_index_key_id
  );
}

async function selectLegacyParticipant(
  client: pg.PoolClient,
  teamId: string,
  id: string,
): Promise<LegacyParticipantRow | undefined> {
  const selected = await client.query<LegacyParticipantRow>(
    `SELECT id, team_id, study_id, participant_code, pii_key_id, pii_algorithm,
      email_ciphertext, phone_ciphertext, name_ciphertext, attributes_ciphertext,
      email_index, phone_index, blind_index_key_id
     FROM participants WHERE team_id = $1 AND id = $2 FOR UPDATE`,
    [teamId, id],
  );
  return selected.rows[0];
}

async function migrateLegacyParticipantIndex(
  pool: pg.Pool,
  keys: EncryptionKeys,
  row: LegacyParticipantRow,
): Promise<void> {
  if (
    !row.pii_key_id ||
    !row.pii_algorithm ||
    row.blind_index_key_id !== RAW_LEGACY_PARTICIPANT_INDEX_ID ||
    row.pii_key_id === keys.currentId('pii-enc')
  )
    throw new ProtectedDataError();
  const tenant = createTenantDb(pool, row.team_id);
  const command = {
    tenantDb: tenant,
    actorLabel: 'Encryption maintenance',
    requestId: randomUUID(),
  } as const;
  const target = {
    teamId: row.team_id,
    studyId: row.study_id,
    participantId: row.id,
  };
  const protection = createDataProtection(keys, {
    participant: async (field, read) => {
      await runAuditedSystemMutation(command, async (client, context) => {
        const current = await selectLegacyParticipant(
          client,
          row.team_id,
          row.id,
        );
        if (!current || !sameLegacyParticipant(row, current))
          throw new ProtectedDataError();
        read();
        return {
          result: undefined,
          events: [
            participantEvent(context, row, 'participant.pii.rotation_read', [
              field.column,
            ]),
          ],
        };
      });
    },
    integration: async () => {
      throw new ProtectedDataError();
    },
  });
  const plaintexts = new Map<ParticipantField['column'], Buffer>();
  const ciphertexts: (Buffer | null)[] = [];
  try {
    for (const column of PARTICIPANT_PII_COLUMNS) {
      const stored = row[column];
      if (stored === null) {
        ciphertexts.push(null);
        continue;
      }
      const field = { ...target, column };
      const plaintext = await protection.readParticipant(field, {
        keyId: row.pii_key_id,
        algorithm: row.pii_algorithm,
        envelope: stored,
      });
      plaintexts.set(column, plaintext);
      ciphertexts.push(
        protection.encryptParticipant(
          field,
          plaintext,
          keys.currentId('pii-enc'),
        ).envelope,
      );
    }
    const email = plaintexts.get('email_ciphertext');
    const phone = plaintexts.get('phone_ciphertext');
    const emailIndex = email
      ? createContactBlindIndex(keys, {
          kind: 'email',
          value: email.toString('utf8'),
        })
      : null;
    const phoneIndex = phone
      ? createContactBlindIndex(keys, {
          kind: 'phone',
          value: phone.toString('utf8'),
        })
      : null;
    await runAuditedSystemMutation(command, async (client, context) => {
      const current = await selectLegacyParticipant(
        client,
        row.team_id,
        row.id,
      );
      if (!current || !sameLegacyParticipant(row, current))
        throw new ProtectedDataError();
      await client.query(
        "SELECT set_config('app.legacy_index_remediation', 'v1', true)",
      );
      await registerAuthenticatedLegacyKeyProofTransaction(
        client,
        keys,
        row.pii_key_id!,
      );
      const updated = await client.query(
        `UPDATE participants SET email_ciphertext = $3, phone_ciphertext = $4,
          name_ciphertext = $5, attributes_ciphertext = $6, email_index = $7,
          phone_index = $8, blind_index_key_id = $9, pii_key_id = $10,
          pii_algorithm = 'aes-256-gcm.v1', updated_at = now()
         WHERE id = $1 AND team_id = $2`,
        [
          row.id,
          row.team_id,
          ...ciphertexts,
          emailIndex?.value ?? null,
          phoneIndex?.value ?? null,
          emailIndex?.keyId ?? phoneIndex?.keyId ?? null,
          keys.currentId('pii-enc'),
        ],
      );
      if (updated.rowCount !== 1) throw new ProtectedDataError();
      return {
        result: undefined,
        events: [
          participantEvent(context, row, 'participant.pii.rotated', [
            ...PARTICIPANT_PII_COLUMNS,
          ]),
        ],
      };
    });
  } finally {
    for (const plaintext of plaintexts.values()) plaintext.fill(0);
  }
}

async function migrateLegacyParticipantIndexBatch(
  pool: pg.Pool,
  keys: EncryptionKeys,
  limit: number,
): Promise<{ processed: number; passComplete: boolean }> {
  const selected = await readMaintenancePage<LegacyParticipantRow>(
    pool,
    `SELECT id, team_id, study_id, participant_code, pii_key_id, pii_algorithm,
      email_ciphertext, phone_ciphertext, name_ciphertext, attributes_ciphertext,
      email_index, phone_index, blind_index_key_id
     FROM participants WHERE blind_index_key_id = $2 ORDER BY id LIMIT $1`,
    [limit, RAW_LEGACY_PARTICIPANT_INDEX_ID],
  );
  for (const row of selected.rows)
    await migrateLegacyParticipantIndex(pool, keys, row);
  return {
    processed: selected.rows.length,
    passComplete: selected.rows.length < limit,
  };
}

async function rotateWebhook(
  pool: pg.Pool,
  keys: EncryptionKeys,
  row: WebhookCiphertextRow,
): Promise<void> {
  const plaintext = await readWebhookSecret(keys, row.id, {
    kind: 'rotation',
    maintenancePool: pool,
    teamId: row.team_id,
  });
  try {
    const protection = createDataProtection(keys, {
      participant: async () => {
        throw new ProtectedDataError();
      },
      integration: async () => {
        throw new ProtectedDataError();
      },
    });
    const sealed = protection.encryptIntegration(
      {
        kind: 'webhook',
        teamId: row.team_id,
        subscriptionId: row.id,
        column: 'secret_ciphertext',
      },
      plaintext,
    );
    await runAuditedSystemMutation(
      {
        tenantDb: createTenantDb(pool, row.team_id),
        actorLabel: 'Encryption maintenance',
        requestId: randomUUID(),
      },
      async (client, context) => {
        const current = await selectWebhookCiphertext(
          client,
          row.team_id,
          row.id,
          true,
        );
        if (
          !current ||
          current.secret_key_id !== row.secret_key_id ||
          current.secret_algorithm !== row.secret_algorithm ||
          !current.secret_ciphertext.equals(row.secret_ciphertext)
        )
          throw new ProtectedDataError();
        await client.query(
          'UPDATE webhook_subscriptions SET secret_ciphertext = $3, secret_key_id = $4, secret_algorithm = $5 WHERE id = $1 AND team_id = $2',
          [
            row.id,
            row.team_id,
            sealed.envelope,
            sealed.keyId,
            sealed.algorithm,
          ],
        );
        return {
          result: undefined,
          events: [
            {
              ...context,
              eventType: 'webhook.secret.rotated',
              eventVersion: 1,
              category: 'integration',
              outcome: 'succeeded',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              resourceType: 'webhook_subscription',
              resourceId: row.id,
              resourceLabel: null,
              details: { purpose: 'rotation' },
            },
          ],
        };
      },
    );
  } finally {
    plaintext.fill(0);
  }
}

const OAUTH_SELECT = `id, "userId", ${OAUTH_FIELDS.map((spec) => `${spec.ciphertext} AS "${spec.field}", ${spec.keyColumn} AS "${spec.keyId}", ${spec.algorithmColumn} AS "${spec.algorithm}"`).join(', ')}`;
type OAuthRow = Record<string, unknown> & { id: string; userId: string };

function sameOAuth(left: OAuthRow, right: OAuthRow): boolean {
  return (
    left.userId === right.userId &&
    OAUTH_FIELDS.every((spec) => {
      const a = left[spec.field];
      const b = right[spec.field];
      return (
        (a === null
          ? b === null
          : Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b)) &&
        left[spec.keyId] === right[spec.keyId] &&
        left[spec.algorithm] === right[spec.algorithm]
      );
    })
  );
}

async function writeOAuth(
  client: pg.PoolClient,
  id: string,
  values: Record<string, unknown>,
  clearLegacy = false,
): Promise<void> {
  const parameters: unknown[] = [id];
  const assignments: string[] = [];
  for (const spec of OAUTH_FIELDS) {
    for (const [column, logical] of [
      [spec.ciphertext, spec.field],
      [spec.keyColumn, spec.keyId],
      [spec.algorithmColumn, spec.algorithm],
    ]) {
      parameters.push(values[logical!] ?? null);
      assignments.push(`${column} = $${parameters.length}`);
    }
    if (clearLegacy) assignments.push(`"${spec.field}" = NULL`);
  }
  await client.query(
    `UPDATE account SET ${assignments.join(', ')} WHERE id = $1`,
    parameters,
  );
}

async function rotateOAuth(
  pool: pg.Pool,
  keys: EncryptionKeys,
  row: OAuthRow,
): Promise<void> {
  const plaintext = await readOAuthFields(pool, keys, row);
  const sealed = sealOAuthFields(
    keys,
    row,
    Object.fromEntries(
      OAUTH_FIELDS.map(({ field }) => [field, plaintext[field]]),
    ),
  );
  await credentialTransaction(
    pool,
    async (client) => {
      const locked = await client.query<OAuthRow>(
        `SELECT ${OAUTH_SELECT} FROM account WHERE id = $1 FOR UPDATE`,
        [row.id],
      );
      const current = locked.rows[0];
      if (!current || !sameOAuth(row, current)) throw new ProtectedDataError();
      await writeOAuth(client, row.id, sealed);
      await appendCredentialAudit(client, row, 'rotate', randomUUID());
    },
    true,
  );
}

/**
 * Offline conversion uses the connecting operator itself, never a SET ROLE
 * capability available to the web/worker login. Check direct SELECT ACLs (or
 * ownership/superuser authority), not has_column_privilege's inherited grants.
 */
async function legacyOperatorTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await client.query<{ allowed: boolean }>(`
      SELECT current_user = session_user AND identity.rolcanlogin
        AND identity.rolname NOT IN ('studio_app', 'studio_maintenance', 'studio_backup')
        AND (identity.rolsuper OR account.relowner = identity.oid OR NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY['accessToken', 'refreshToken', 'idToken']) required(name)
          WHERE NOT EXISTS (
            SELECT 1 FROM aclexplode(account.relacl) grant_entry
            WHERE grant_entry.grantee = identity.oid AND grant_entry.privilege_type = 'SELECT'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_attribute column_definition,
              aclexplode(column_definition.attacl) grant_entry
            WHERE column_definition.attrelid = account.oid
              AND column_definition.attname = required.name AND NOT column_definition.attisdropped
              AND grant_entry.grantee = identity.oid AND grant_entry.privilege_type = 'SELECT'
          )
        )) AS allowed
      FROM pg_roles identity CROSS JOIN pg_class account
      WHERE identity.rolname = session_user AND account.oid = to_regclass('account')
        AND account.relkind = 'r' AND account.relpersistence = 'p'
    `);
    if (access.rows[0]?.allowed !== true) throw new ProtectedDataError();
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

async function readOrderedPage<Row extends pg.QueryResultRow>(
  client: pg.PoolClient,
  statement: string,
  values: (string | number)[],
): Promise<pg.QueryResult<Row>> {
  await client.query(
    'SET LOCAL enable_bitmapscan = off; SET LOCAL enable_seqscan = off; SET LOCAL enable_sort = off',
  );
  return client.query<Row>(statement, values);
}

/**
 * RLS selectivity estimates can otherwise choose an eager bitmap/heap sort of
 * the entire suffix before LIMIT. These maintenance-only, transaction-local
 * settings retain native PK ordering and never affect application sessions.
 */
async function readMaintenancePage<Row extends pg.QueryResultRow>(
  pool: pg.Pool,
  statement: string,
  values: (string | number)[],
): Promise<pg.QueryResult<Row>> {
  return credentialTransaction(
    pool,
    (client) => readOrderedPage<Row>(client, statement, values),
    true,
  );
}

/**
 * Visit at most limit rows in native primary-key order, including rows already
 * using the target keys. No remaining-corpus scan runs between pages. A cursor
 * advances only after committed records and binds both target key purposes.
 * passComplete means traversal exhaustion, not permission to retire old roots.
 */
export async function rotateEncryptionBatch(
  pool: pg.Pool,
  keys: EncryptionKeys,
  input: { limit: number; cursor?: RotationCursor | null },
): Promise<{
  processed: number;
  scanned: number;
  passComplete: boolean;
  cursor: RotationCursor | null;
}> {
  const limit = limitSchema.parse(input.limit);
  const start: RotationCursor = input.cursor
    ? parseRotationCursor(input.cursor)
    : {
        phase: 'participants',
        afterId: null,
        piiKeyId: keys.currentId('pii-enc'),
        integrationKeyId: keys.currentId('integration-enc'),
      };
  if (
    start.piiKeyId !== keys.currentId('pii-enc') ||
    start.integrationKeyId !== keys.currentId('integration-enc')
  )
    throw new ProtectedDataError();
  await credentialTransaction(pool, async () => undefined, true);
  let cursor = { ...start };
  let processed = 0;
  let scanned = 0;
  while (scanned < limit) {
    const cap = limit - scanned;
    // Separate first/subsequent-page predicates let PostgreSQL use the native
    // PK index directly, including when the prepared plan becomes generic.
    const where = cursor.afterId === null ? '' : 'WHERE id > $2';
    const values = cursor.afterId === null ? [cap] : [cap, cursor.afterId];
    let ids: string[];
    if (cursor.phase === 'participants') {
      const selected = await readMaintenancePage<ParticipantCiphertextRow>(
        pool,
        `SELECT id, team_id, study_id, participant_code, pii_key_id, pii_algorithm, email_ciphertext, phone_ciphertext, name_ciphertext, attributes_ciphertext FROM participants ${where} ORDER BY id LIMIT $1`,
        values,
      );
      ids = selected.rows.map((row) => row.id);
      for (const row of selected.rows) {
        if (row.pii_key_id !== null && row.pii_key_id !== cursor.piiKeyId) {
          await rotateParticipant(pool, keys, row);
          processed += 1;
        }
      }
    } else if (cursor.phase === 'webhooks') {
      const selected = await readMaintenancePage<WebhookCiphertextRow>(
        pool,
        `SELECT id, team_id, secret_ciphertext, secret_key_id, secret_algorithm, state FROM webhook_subscriptions ${where} ORDER BY id LIMIT $1`,
        values,
      );
      ids = selected.rows.map((row) => row.id);
      for (const row of selected.rows) {
        if (row.secret_key_id !== cursor.integrationKeyId) {
          await rotateWebhook(pool, keys, row);
          processed += 1;
        }
      }
    } else {
      const selected = await readMaintenancePage<OAuthRow>(
        pool,
        `SELECT ${OAUTH_SELECT} FROM account ${where} ORDER BY id LIMIT $1`,
        values,
      );
      ids = selected.rows.map((row) => row.id);
      for (const row of selected.rows) {
        if (
          OAUTH_FIELDS.some(
            ({ keyId }) =>
              row[keyId] !== null && row[keyId] !== cursor.integrationKeyId,
          )
        ) {
          await rotateOAuth(pool, keys, row);
          processed += 1;
        }
      }
    }
    scanned += ids.length;
    if (ids.length === cap)
      return {
        processed,
        scanned,
        passComplete: false,
        cursor: { ...cursor, afterId: ids.at(-1)! },
      };
    const next = PHASES[PHASES.indexOf(cursor.phase) + 1];
    if (!next) return { processed, scanned, passComplete: true, cursor: null };
    cursor = { ...cursor, phase: next, afterId: null };
  }
  throw new ProtectedDataError();
}

/** Offline only: preserve legacy values until encryption and audit commit. */
export async function migrateLegacyOAuthBatch(
  pool: pg.Pool,
  keys: EncryptionKeys,
  input: { limit: number; afterId?: string | null },
): Promise<{
  processed: number;
  scanned: number;
  afterId: string | null;
  passComplete: boolean;
}> {
  const limit = limitSchema.parse(input.limit);
  const afterId = parseLegacyCursor(input.afterId ?? null);
  const ids = await legacyOperatorTransaction(pool, (client) =>
    readOrderedPage<{ id: string; legacy: boolean }>(
      client,
      `SELECT id, legacy_tokens_present AS legacy FROM account ${afterId === null ? '' : 'WHERE id > $2'} ORDER BY id LIMIT $1`,
      afterId === null ? [limit] : [limit, afterId],
    ),
  );
  let processed = 0;
  for (const { id, legacy } of ids.rows) {
    if (!legacy) continue;
    const converted = await legacyOperatorTransaction(pool, async (client) => {
      const selected = await client.query<
        OAuthRow & {
          legacy_access: string | null;
          legacy_refresh: string | null;
          legacy_id: string | null;
        }
      >(
        `SELECT ${OAUTH_SELECT}, "accessToken" AS legacy_access, "refreshToken" AS legacy_refresh, "idToken" AS legacy_id FROM account WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = selected.rows[0];
      if (
        !row ||
        [row.legacy_access, row.legacy_refresh, row.legacy_id].every(
          (value) => value === null,
        )
      )
        return false;
      if (OAUTH_FIELDS.some(({ field }) => row[field] !== null))
        throw new ProtectedDataError();
      const sealed = sealOAuthFields(keys, row, {
        accessToken: row.legacy_access,
        refreshToken: row.legacy_refresh,
        idToken: row.legacy_id,
      });
      await writeOAuth(client, id, sealed, true);
      await appendCredentialAudit(client, row, 'migrate_legacy', randomUUID());
      return true;
    });
    if (converted) processed += 1;
  }
  const passComplete = ids.rows.length < limit;
  return {
    processed,
    scanned: ids.rows.length,
    passComplete,
    afterId: passComplete ? null : ids.rows.at(-1)!.id,
  };
}

/**
 * One bounded offline pass. Raw participant indexes are authenticated and
 * rewritten first, irreversible public-HMAC values are classified second, and
 * retained OAuth plaintext is touched only after both prerequisite phases are
 * exhausted.
 */
export async function migrateLegacyDataBatch(
  maintenancePool: pg.Pool,
  legacyOperatorPool: pg.Pool,
  keys: EncryptionKeys,
  input: { limit: number; afterId?: string | null },
): Promise<{
  processed: number;
  scanned: number;
  afterId: string | null;
  passComplete: boolean;
}> {
  const limit = limitSchema.parse(input.limit);
  const afterId = parseLegacyCursor(input.afterId ?? null);
  const participants = await migrateLegacyParticipantIndexBatch(
    maintenancePool,
    keys,
    limit,
  );
  if (!participants.passComplete)
    return {
      processed: participants.processed,
      scanned: participants.processed,
      afterId,
      passComplete: false,
    };
  let scanned = participants.processed;
  let processed = participants.processed;
  const classifications = await classifyLegacyContactIndexBatch(
    legacyOperatorPool,
    limit - scanned,
  );
  scanned += classifications.processed;
  processed += classifications.processed;
  if (!classifications.passComplete || scanned === limit)
    return { processed, scanned, afterId, passComplete: false };
  const oauth = await migrateLegacyOAuthBatch(legacyOperatorPool, keys, {
    limit: limit - scanned,
    afterId,
  });
  return {
    processed: processed + oauth.processed,
    scanned: scanned + oauth.scanned,
    afterId: oauth.afterId,
    passComplete: oauth.passComplete,
  };
}
