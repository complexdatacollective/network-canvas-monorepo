import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  runAuditedSystemMutation,
  type SystemAuditEventContext,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import type { EncryptionKeys } from './keys.ts';
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
  return cursorSchema.parse(value);
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

const OLD_OAUTH = OAUTH_FIELDS.map(
  ({ keyColumn }) => `(${keyColumn} IS NOT NULL AND ${keyColumn} <> $1)`,
).join(' OR ');

/**
 * One bounded, resumable pass. The cursor is non-secret, binds target key IDs,
 * and advances only after committed records. Failure leaves the caller's last
 * returned cursor safe to replay. No keys/proofs are deleted on completion.
 */
export async function rotateEncryptionBatch(
  pool: pg.Pool,
  keys: EncryptionKeys,
  input: { limit: number; cursor?: RotationCursor | null },
): Promise<{
  processed: number;
  cursor: RotationCursor | null;
  remaining: number;
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
  while (processed < limit) {
    const cap = limit - processed;
    let ids: string[];
    if (cursor.phase === 'participants') {
      const selected = await pool.query<ParticipantCiphertextRow>(
        `SELECT id, team_id, study_id, participant_code, pii_key_id, pii_algorithm, email_ciphertext, phone_ciphertext, name_ciphertext, attributes_ciphertext FROM participants WHERE pii_key_id IS NOT NULL AND pii_key_id <> $1 AND ($2::text IS NULL OR id::text > $2) ORDER BY id::text LIMIT $3`,
        [cursor.piiKeyId, cursor.afterId, cap],
      );
      ids = selected.rows.map((row) => row.id);
      for (const row of selected.rows) await rotateParticipant(pool, keys, row);
    } else if (cursor.phase === 'webhooks') {
      const selected = await pool.query<WebhookCiphertextRow>(
        'SELECT id, team_id, secret_ciphertext, secret_key_id, secret_algorithm, state FROM webhook_subscriptions WHERE secret_key_id <> $1 AND ($2::text IS NULL OR id::text > $2) ORDER BY id::text LIMIT $3',
        [cursor.integrationKeyId, cursor.afterId, cap],
      );
      ids = selected.rows.map((row) => row.id);
      for (const row of selected.rows) await rotateWebhook(pool, keys, row);
    } else {
      const selected = await pool.query<OAuthRow>(
        `SELECT ${OAUTH_SELECT} FROM account WHERE (${OLD_OAUTH}) AND ($2::text IS NULL OR id > $2) ORDER BY id LIMIT $3`,
        [cursor.integrationKeyId, cursor.afterId, cap],
      );
      ids = selected.rows.map((row) => row.id);
      for (const row of selected.rows) await rotateOAuth(pool, keys, row);
    }
    processed += ids.length;
    if (ids.length === cap) {
      cursor.afterId = ids.at(-1)!;
      break;
    }
    const next = PHASES[PHASES.indexOf(cursor.phase) + 1];
    if (!next) break;
    cursor = { ...cursor, phase: next, afterId: null };
  }
  const count = await pool.query<{ remaining: number }>(
    `SELECT ((SELECT count(*) FROM participants WHERE pii_key_id IS NOT NULL AND pii_key_id <> $2) + (SELECT count(*) FROM webhook_subscriptions WHERE secret_key_id <> $1) + (SELECT count(*) FROM account WHERE ${OLD_OAUTH}))::int AS remaining`,
    [cursor.integrationKeyId, cursor.piiKeyId],
  );
  const remaining = count.rows[0]?.remaining ?? -1;
  if (remaining < 0) throw new ProtectedDataError();
  // Another old replica may have written behind this cursor. Restart a pass
  // instead of falsely reporting success; operators stop old writers first.
  return {
    processed,
    remaining,
    cursor:
      remaining === 0
        ? null
        : processed < limit
          ? { ...start, phase: 'participants', afterId: null }
          : cursor,
  };
}

/** Offline only: preserve legacy values until encryption and audit commit. */
export async function migrateLegacyOAuthBatch(
  pool: pg.Pool,
  keys: EncryptionKeys,
  input: { limit: number; afterId?: string | null },
): Promise<{ processed: number; afterId: string | null; remaining: number }> {
  const limit = limitSchema.parse(input.limit);
  const afterId = parseLegacyCursor(input.afterId ?? null);
  const legacyWhere =
    '"accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL OR "idToken" IS NOT NULL';
  await credentialTransaction(pool, async () => undefined, true);
  const ids = await pool.query<{ id: string }>(
    `SELECT id FROM account WHERE (${legacyWhere}) AND ($1::text IS NULL OR id > $1) ORDER BY id LIMIT $2`,
    [afterId, limit],
  );
  for (const { id } of ids.rows) {
    await credentialTransaction(
      pool,
      async (client) => {
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
          return;
        if (OAUTH_FIELDS.some(({ field }) => row[field] !== null))
          throw new ProtectedDataError();
        const sealed = sealOAuthFields(keys, row, {
          accessToken: row.legacy_access,
          refreshToken: row.legacy_refresh,
          idToken: row.legacy_id,
        });
        await writeOAuth(client, id, sealed, true);
        await appendCredentialAudit(
          client,
          row,
          'migrate_legacy',
          randomUUID(),
        );
      },
      true,
    );
  }
  const count = await pool.query<{ remaining: number }>(
    `SELECT count(*)::int AS remaining FROM account WHERE ${legacyWhere}`,
  );
  const remaining = count.rows[0]?.remaining ?? -1;
  if (remaining < 0) throw new ProtectedDataError();
  return {
    processed: ids.rows.length,
    remaining,
    afterId:
      remaining === 0 || ids.rows.length < limit ? null : ids.rows.at(-1)!.id,
  };
}
