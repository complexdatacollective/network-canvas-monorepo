import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

const postmark = z.object({
  MessageID: z.uuid(),
  RecordType: z.enum(['Delivery', 'Bounce', 'SpamComplaint']),
  DeliveredAt: z.string().max(64).optional(),
  BouncedAt: z.string().max(64).optional(),
  ReceivedAt: z.string().max(64).optional(),
  TypeCode: z.number().int().optional(),
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const delivery = await client.query<{
      id: string;
      team_id: string;
      channel: 'email' | 'sms';
      recipient_blind_index: Buffer;
      blind_index_key_id: string;
    }>(
      `SELECT id,team_id,channel,recipient_blind_index,blind_index_key_id FROM message_deliveries
       WHERE provider=$1 AND provider_message_id=$2 ${input.deliveryId ? 'AND id=$3' : ''} FOR UPDATE`,
      input.deliveryId
        ? [input.provider, input.providerMessageId, input.deliveryId]
        : [input.provider, input.providerMessageId],
    );
    const row = delivery.rows[0];
    if (!row) throw new Error('MESSAGE_STATUS_NOT_FOUND');
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
    if (
      inserted.rowCount &&
      (input.kind === 'bounced' || input.kind === 'complained')
    ) {
      await client.query(
        `INSERT INTO participant_contact_optouts(channel,recipient_blind_index,blind_index_key_id,source)
         VALUES($1,$2,$3,'provider') ON CONFLICT(channel,blind_index_key_id,recipient_blind_index) DO NOTHING`,
        [row.channel, row.recipient_blind_index, row.blind_index_key_id],
      );
    }
    await client.query('COMMIT');
    return inserted.rowCount === 1;
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
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
  const timestamp = parsed.DeliveredAt ?? parsed.BouncedAt ?? parsed.ReceivedAt;
  const occurredAt = timestamp ? new Date(timestamp) : new Date();
  if (!Number.isFinite(occurredAt.getTime()))
    throw new Error('MESSAGE_STATUS_INVALID');
  const providerEventId = `${parsed.MessageID}:${parsed.RecordType}:${occurredAt.toISOString()}`;
  return store(pool, {
    provider: 'postmark',
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
    .toSorted(([a], [b]) => a.localeCompare(b))
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
      : parsed.data.MessageStatus === 'failed' ||
          parsed.data.MessageStatus === 'undelivered'
        ? 'bounced'
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
