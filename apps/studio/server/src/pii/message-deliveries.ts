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
import { createDataProtection, ProtectedDataError } from './protection.ts';

export const RenderedMessageSchema = z
  .strictObject({
    subject: z.string().min(1).max(200).nullable(),
    body: z
      .string()
      .min(1)
      .max(8000)
      .refine((value) => value.isWellFormed() && !value.includes('\0')),
  })
  .refine(
    // The aes-256-gcm.v1 envelope adds one version byte, a 12-byte nonce and
    // a 16-byte tag to UTF-8 JSON; the persisted envelope is capped at 16 KiB.
    (value) =>
      Buffer.byteLength(JSON.stringify(value), 'utf8') + 1 + 12 + 16 <= 16_384,
    { message: 'Rendered message exceeds its encrypted storage limit' },
  );
export type RenderedMessage = z.infer<typeof RenderedMessageSchema>;

export type DeliveryCiphertext = {
  id: string;
  team_id: string;
  study_id: string;
  participant_id: string;
  channel: 'email' | 'sms';
  lease_owner: string | null;
  lease_expires_at: Date | null;
  lease_active: boolean;
  rendered_ciphertext: Buffer;
  rendered_key_id: string;
  rendered_algorithm: string;
};

function sameRenderedCiphertext(
  current: DeliveryCiphertext | undefined,
  expected: DeliveryCiphertext,
): boolean {
  return Boolean(
    current &&
    current.rendered_key_id === expected.rendered_key_id &&
    current.rendered_algorithm === expected.rendered_algorithm &&
    current.rendered_ciphertext.equals(expected.rendered_ciphertext),
  );
}

function event(
  context: SystemAuditEventContext<'Message delivery'>,
  row: DeliveryCiphertext,
  type: 'message.payload.read' | 'message.contact.read',
): AuditEventInput {
  return {
    ...context,
    eventVersion: 1,
    eventType: type,
    category: 'participant_data',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'message_delivery',
    resourceId: row.id,
    resourceLabel: null,
    details: { channel: row.channel },
  };
}

async function selectDelivery(
  client: Pick<pg.PoolClient, 'query'>,
  id: string,
  teamId: string,
  lock = false,
) {
  const result = await client.query<DeliveryCiphertext>(
    `SELECT id, team_id, study_id, participant_id, channel, lease_owner, lease_expires_at,
            lease_expires_at > statement_timestamp() AS lease_active,
            rendered_ciphertext, rendered_key_id, rendered_algorithm
     FROM message_deliveries WHERE id = $1 AND team_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
    [id, teamId],
  );
  return result.rows[0];
}

function proveLease(
  row: DeliveryCiphertext | undefined,
  expected: DeliveryCiphertext,
  owner: string,
) {
  if (
    !row ||
    row.lease_owner !== owner ||
    !row.lease_expires_at ||
    !row.lease_active ||
    row.rendered_key_id !== expected.rendered_key_id ||
    row.rendered_algorithm !== expected.rendered_algorithm ||
    !row.rendered_ciphertext.equals(expected.rendered_ciphertext)
  )
    throw new ProtectedDataError();
}

export function sealRenderedMessage(
  keys: EncryptionKeys,
  teamId: string,
  deliveryId: string,
  input: RenderedMessage,
) {
  const rendered = RenderedMessageSchema.parse(input);
  const bytes = Buffer.from(JSON.stringify(rendered));
  try {
    return createDataProtection(keys, {
      participant: async () => {
        throw new ProtectedDataError();
      },
      integration: async () => {
        throw new ProtectedDataError();
      },
    }).encryptIntegration(
      { kind: 'message', teamId, deliveryId, column: 'rendered_ciphertext' },
      bytes,
    );
  } finally {
    bytes.fill(0);
  }
}

export async function readRenderedMessage(
  keys: EncryptionKeys,
  pool: pg.Pool,
  input: { teamId: string; deliveryId: string; leaseOwner: string },
): Promise<RenderedMessage> {
  const tenant = createTenantDb(pool, input.teamId);
  const row = await selectDelivery(pool, input.deliveryId, input.teamId);
  if (!row) throw new ProtectedDataError();
  const protection = createDataProtection(keys, {
    participant: async () => {
      throw new ProtectedDataError();
    },
    integration: async (_target, read) => {
      await runAuditedSystemMutation(
        {
          tenantDb: tenant,
          actorLabel: 'Message delivery',
          requestId: randomUUID(),
        },
        async (client, context) => {
          proveLease(
            await selectDelivery(client, input.deliveryId, input.teamId, true),
            row,
            input.leaseOwner,
          );
          read();
          return {
            result: undefined,
            events: [event(context, row, 'message.payload.read')],
          };
        },
      );
    },
  });
  const plaintext = await protection.readIntegration(
    {
      kind: 'message',
      teamId: input.teamId,
      deliveryId: input.deliveryId,
      column: 'rendered_ciphertext',
    },
    {
      keyId: row.rendered_key_id,
      algorithm: row.rendered_algorithm,
      envelope: row.rendered_ciphertext,
    },
  );
  try {
    return RenderedMessageSchema.parse(JSON.parse(plaintext.toString('utf8')));
  } catch {
    throw new ProtectedDataError();
  } finally {
    plaintext.fill(0);
  }
}

/** Reads a retained rendered payload solely for integration-key rotation. */
export async function readRenderedMessageForRotation(
  keys: EncryptionKeys,
  pool: pg.Pool,
  row: DeliveryCiphertext,
): Promise<RenderedMessage> {
  const protection = createDataProtection(keys, {
    participant: async () => {
      throw new ProtectedDataError();
    },
    integration: async (_target, read) => {
      await runAuditedSystemMutation(
        {
          tenantDb: createTenantDb(pool, row.team_id),
          actorLabel: 'Encryption maintenance',
          requestId: randomUUID(),
        },
        async (client, context) => {
          const current = await selectDelivery(
            client,
            row.id,
            row.team_id,
            true,
          );
          if (!sameRenderedCiphertext(current, row))
            throw new ProtectedDataError();
          read();
          return {
            result: undefined,
            events: [
              {
                ...context,
                eventVersion: 1,
                eventType: 'message.payload.rotation_read',
                category: 'participant_data',
                outcome: 'succeeded',
                subjectType: null,
                subjectId: null,
                subjectLabel: null,
                resourceType: 'message_delivery',
                resourceId: row.id,
                resourceLabel: null,
                details: { channel: row.channel, purpose: 'rotation' },
              } satisfies AuditEventInput,
            ],
          };
        },
      );
    },
  });
  const plaintext = await protection.readIntegration(
    {
      kind: 'message',
      teamId: row.team_id,
      deliveryId: row.id,
      column: 'rendered_ciphertext',
    },
    {
      keyId: row.rendered_key_id,
      algorithm: row.rendered_algorithm,
      envelope: row.rendered_ciphertext,
    },
  );
  try {
    return RenderedMessageSchema.parse(JSON.parse(plaintext.toString('utf8')));
  } catch {
    throw new ProtectedDataError();
  } finally {
    plaintext.fill(0);
  }
}

export async function readDeliveryContact(
  keys: EncryptionKeys,
  pool: pg.Pool,
  input: { teamId: string; deliveryId: string; leaseOwner: string },
): Promise<Buffer> {
  const tenant = createTenantDb(pool, input.teamId);
  const snapshotClient = await pool.connect();
  const snapshot = await (async () => {
    const delivery = await selectDelivery(
      snapshotClient,
      input.deliveryId,
      input.teamId,
    );
    if (!delivery) throw new ProtectedDataError();
    const column: 'email_ciphertext' | 'phone_ciphertext' =
      delivery.channel === 'email' ? 'email_ciphertext' : 'phone_ciphertext';
    const participant = await snapshotClient.query<{
      pii_key_id: string | null;
      pii_algorithm: string | null;
      ciphertext: Buffer | null;
    }>(
      `SELECT pii_key_id, pii_algorithm, ${column} AS ciphertext FROM participants
       WHERE id = $1 AND study_id = $2 AND team_id = $3`,
      [delivery.participant_id, delivery.study_id, input.teamId],
    );
    return { delivery, column, participant: participant.rows[0] };
  })().finally(() => snapshotClient.release());
  const stored = snapshot.participant;
  if (!stored?.ciphertext || !stored.pii_key_id || !stored.pii_algorithm)
    throw new ProtectedDataError();
  const ciphertext = stored.ciphertext;
  const protection = createDataProtection(keys, {
    integration: async () => {
      throw new ProtectedDataError();
    },
    participant: async (_target, read) => {
      await runAuditedSystemMutation(
        {
          tenantDb: tenant,
          actorLabel: 'Message delivery',
          requestId: randomUUID(),
        },
        async (client, context) => {
          proveLease(
            await selectDelivery(client, input.deliveryId, input.teamId, true),
            snapshot.delivery,
            input.leaseOwner,
          );
          const current = await client.query<{
            pii_key_id: string | null;
            pii_algorithm: string | null;
            ciphertext: Buffer | null;
          }>(
            `SELECT pii_key_id, pii_algorithm, ${snapshot.column} AS ciphertext FROM participants
           WHERE id = $1 AND study_id = $2 AND team_id = $3 FOR UPDATE`,
            [
              snapshot.delivery.participant_id,
              snapshot.delivery.study_id,
              input.teamId,
            ],
          );
          const row = current.rows[0];
          if (
            !row?.ciphertext ||
            row.pii_key_id !== stored.pii_key_id ||
            row.pii_algorithm !== stored.pii_algorithm ||
            !row.ciphertext.equals(ciphertext)
          )
            throw new ProtectedDataError();
          read();
          return {
            result: undefined,
            events: [event(context, snapshot.delivery, 'message.contact.read')],
          };
        },
      );
    },
  });
  return protection.readParticipant(
    {
      teamId: input.teamId,
      studyId: snapshot.delivery.study_id,
      participantId: snapshot.delivery.participant_id,
      column: snapshot.column,
    },
    {
      keyId: stored.pii_key_id,
      algorithm: stored.pii_algorithm,
      envelope: ciphertext,
    },
  );
}
