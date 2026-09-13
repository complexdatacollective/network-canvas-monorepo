import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  runAuditedSystemMutation,
  type SystemAuditEventContext,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { lockParticipantMessageAuthority } from './participant-authority.ts';

const postmark = z.object({
  MessageID: z.uuid(),
  RecordType: z.enum(['Delivery', 'Bounce', 'SpamComplaint']),
  DeliveredAt: z.string().max(64).optional(),
  BouncedAt: z.string().max(64).optional(),
  ReceivedAt: z.string().max(64).optional(),
  TypeCode: z.number().int().optional(),
  Metadata: z.strictObject({ deliveryId: z.uuid() }).optional(),
});
const twilio = z.object({
  MessageSid: z.string().regex(/^SM[0-9a-f]{32}$/i),
  MessageStatus: z.enum([
    'queued',
    'sent',
    'delivered',
    'failed',
    'undelivered',
  ]),
  ErrorCode: z
    .string()
    .regex(/^\d{1,8}$/)
    .optional(),
});

function equalSecret(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

class DuplicateStatus extends Error {}

function statusEvent(
  context: SystemAuditEventContext<'Message delivery'>,
  deliveryId: string,
  channel: 'email' | 'sms',
): AuditEventInput {
  return {
    ...context,
    eventVersion: 1,
    eventType: 'message.delivery.status_received',
    category: 'participant_data',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'message_delivery',
    resourceId: deliveryId,
    resourceLabel: null,
    details: { channel },
  };
}

async function store(
  pool: pg.Pool,
  input: {
    deliveryId?: string;
    provider: 'postmark' | 'twilio';
    providerMessageId: string;
    providerEventId: string;
    kind: 'queued' | 'delivered' | 'bounced' | 'complained' | 'failed';
    occurredAt: Date;
    detail: Record<string, string | number>;
  },
) {
  const located = await pool.query<{ team_id: string }>(
    input.deliveryId
      ? `SELECT team_id FROM message_deliveries WHERE id=$1 AND provider=$2 AND send_started_at IS NOT NULL
           AND (provider_message_id IS NULL OR provider_message_id=$3)`
      : 'SELECT team_id FROM message_deliveries WHERE provider=$1 AND provider_message_id=$2',
    input.deliveryId
      ? [input.deliveryId, input.provider, input.providerMessageId]
      : [input.provider, input.providerMessageId],
  );
  const teamId = located.rows[0]?.team_id;
  if (!teamId) throw new Error('MESSAGE_STATUS_NOT_READY');
  try {
    return await runAuditedSystemMutation(
      {
        tenantDb: createTenantDb(pool, teamId),
        actorLabel: 'Message delivery',
        requestId: randomUUID(),
      },
      async (client, context) => {
        const delivery = await client.query<{
          id: string;
          team_id: string;
          channel: 'email' | 'sms';
          participant_id: string;
          recipient_blind_index: Buffer;
          blind_index_key_id: string;
        }>(
          input.deliveryId
            ? `SELECT id,team_id,channel,participant_id,recipient_blind_index,blind_index_key_id FROM message_deliveries
               WHERE id=$1 AND team_id=$2 AND provider=$3 AND send_started_at IS NOT NULL
                 AND (provider_message_id IS NULL OR provider_message_id=$4) FOR UPDATE`
            : `SELECT id,team_id,channel,participant_id,recipient_blind_index,blind_index_key_id FROM message_deliveries
               WHERE team_id=$1 AND provider=$2 AND provider_message_id=$3 FOR UPDATE`,
          input.deliveryId
            ? [
                input.deliveryId,
                teamId,
                input.provider,
                input.providerMessageId,
              ]
            : [teamId, input.provider, input.providerMessageId],
        );
        const row = delivery.rows[0];
        if (!row) throw new Error('MESSAGE_STATUS_NOT_READY');
        await lockParticipantMessageAuthority(
          client,
          row.team_id,
          row.participant_id,
        );
        await client.query(
          `UPDATE message_deliveries SET provider_message_id=coalesce(provider_message_id,$2)
           WHERE id=$1`,
          [row.id, input.providerMessageId],
        );
        const inserted = await client.query(
          `INSERT INTO message_delivery_events(id,team_id,delivery_id,provider,provider_event_id,kind,occurred_at,detail)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(delivery_id,provider,provider_event_id) DO NOTHING`,
          [
            randomUUID(),
            row.team_id,
            row.id,
            input.provider,
            input.providerEventId,
            input.kind,
            input.occurredAt,
            JSON.stringify(input.detail),
          ],
        );
        if (inserted.rowCount !== 1) throw new DuplicateStatus();
        if (input.kind === 'bounced' || input.kind === 'complained') {
          await client.query(
            `INSERT INTO participant_contact_optouts(channel,recipient_blind_index,blind_index_key_id,source)
         VALUES($1,$2,$3,'provider') ON CONFLICT(channel,blind_index_key_id,recipient_blind_index) DO NOTHING`,
            [row.channel, row.recipient_blind_index, row.blind_index_key_id],
          );
        }
        return {
          result: true,
          events: [statusEvent(context, row.id, row.channel)],
        };
      },
    );
  } catch (error) {
    if (error instanceof DuplicateStatus) return false;
    throw error;
  }
}

export async function receivePostmarkStatus(
  pool: pg.Pool,
  options: { token: string; authorization?: string; body: string },
) {
  if (
    !equalSecret(options.authorization, `Bearer ${options.token}`) ||
    Buffer.byteLength(options.body) > 16 * 1024
  )
    throw new Error('MESSAGE_STATUS_UNAUTHORIZED');
  let parsed: z.infer<typeof postmark>;
  try {
    parsed = postmark.parse(JSON.parse(options.body));
  } catch {
    throw new Error('MESSAGE_STATUS_INVALID');
  }
  const kind =
    parsed.RecordType === 'Delivery'
      ? 'delivered'
      : parsed.RecordType === 'Bounce'
        ? 'bounced'
        : 'complained';
  const timestamp =
    parsed.RecordType === 'Delivery'
      ? parsed.DeliveredAt
      : parsed.RecordType === 'Bounce'
        ? parsed.BouncedAt
        : parsed.ReceivedAt;
  if (!timestamp) throw new Error('MESSAGE_STATUS_INVALID');
  const occurredAt = new Date(timestamp);
  if (!Number.isFinite(occurredAt.getTime()))
    throw new Error('MESSAGE_STATUS_INVALID');
  const providerEventId = `${parsed.MessageID}:${parsed.RecordType}:${occurredAt.toISOString()}`;
  return store(pool, {
    provider: 'postmark',
    deliveryId: parsed.Metadata?.deliveryId,
    providerMessageId: parsed.MessageID,
    providerEventId,
    kind,
    occurredAt,
    detail: parsed.TypeCode === undefined ? {} : { typeCode: parsed.TypeCode },
  });
}

export async function receiveTwilioStatus(
  pool: pg.Pool,
  options: {
    authToken: string;
    signature?: string;
    url: string;
    body: string;
    deliveryId: string;
  },
) {
  if (Buffer.byteLength(options.body) > 16 * 1024)
    throw new Error('MESSAGE_STATUS_INVALID');
  const form = new URLSearchParams(options.body);
  const entries = [...form.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new Error('MESSAGE_STATUS_INVALID');
  const signed = entries
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .reduce((value, [key, item]) => value + key + item, options.url);
  const expected = createHmac('sha1', options.authToken)
    .update(signed)
    .digest('base64');
  if (!equalSecret(options.signature, expected))
    throw new Error('MESSAGE_STATUS_UNAUTHORIZED');
  const parsed = twilio.safeParse(Object.fromEntries(entries));
  if (!parsed.success) throw new Error('MESSAGE_STATUS_INVALID');
  const kind =
    parsed.data.MessageStatus === 'delivered'
      ? 'delivered'
      : parsed.data.ErrorCode === '21610'
        ? 'complained'
        : parsed.data.MessageStatus === 'failed' ||
            parsed.data.MessageStatus === 'undelivered'
          ? 'failed'
          : 'queued';
  return store(pool, {
    deliveryId: options.deliveryId,
    provider: 'twilio',
    providerMessageId: parsed.data.MessageSid,
    providerEventId: `${parsed.data.MessageSid}:${parsed.data.MessageStatus}`,
    kind,
    occurredAt: new Date(),
    detail: parsed.data.ErrorCode ? { errorCode: parsed.data.ErrorCode } : {},
  });
}
