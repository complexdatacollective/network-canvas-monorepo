import { createHash, randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { EmailSender } from '@codaco/studio-sync/email-sender';
import { EmailDeliveryError } from '@codaco/studio-sync/email-sender';
import type { SmsSender } from '@codaco/studio-sync/sms-sender';
import { SmsDeliveryError } from '@codaco/studio-sync/sms-sender';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  runAuditedSystemMutation,
  type SystemAuditEventContext,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import {
  OutboxDispatcher,
  type OutboxAdapter,
  type OutboxLease,
  type OutboxRetryOptions,
} from '../outbox/dispatcher.ts';
import type { OutboxObserver } from '../outbox/instrumentation.ts';
import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';
import { createContactBlindIndex, normalizeContact } from '../pii/contacts.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import {
  readDeliveryContact,
  readRenderedMessage,
  sealRenderedMessage,
  type RenderedMessage,
} from '../pii/message-deliveries.ts';
import { ProtectedDataError } from '../pii/protection.ts';

const QUEUE = 'message_deliveries';
const PENDING =
  'sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL';
const OWNED = `id = $1 AND lease_owner = $2 AND ${PENDING}`;

type Channel = 'email' | 'sms';
export type OccurrenceMessage = RenderedMessage & {
  channel: Channel;
  templateId: string;
  kind: 'invitation' | 'prompt' | 'reminder' | 'custom';
};

type ClaimedMessageDelivery = {
  id: string;
  teamId: string;
  studyId: string;
  participantId: string;
  occurrenceId: string | null;
  channel: Channel;
  kind: string;
  recipientBlindIndex: Buffer;
  blindIndexKeyId: string;
  renderedBodyHash: string;
  attemptCount: number;
  leaseOwner: string;
  sendStartedAt: Date | null;
  providerMessageId?: string;
};

type ProviderOptions = {
  email?: { sender: EmailSender; from: string; provider: 'postmark' | 'smtp' };
  sms?: { sender: SmsSender; provider: 'twilio' };
};
type Options = OutboxRetryOptions &
  ProviderOptions & {
    pool: pg.Pool;
    encryptionKeys: EncryptionKeys;
    observer?: OutboxObserver;
  };

class NoOccurrenceChange extends Error {}
class LeaseLost extends Error {}

function messageEvent(
  context: SystemAuditEventContext<'Message delivery'>,
  resourceId: string,
  resourceType: 'schedule_occurrence' | 'message_delivery',
  eventType:
    | 'message.occurrence.dispatched'
    | 'message.occurrence.expired'
    | 'message.delivery.delivered'
    | 'message.delivery.failed'
    | 'message.delivery.uncertain'
    | 'message.delivery.suppressed',
  channel: Channel | null,
): AuditEventInput {
  return {
    ...context,
    eventVersion: 1,
    eventType,
    category: 'participant_data',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType,
    resourceId,
    resourceLabel: null,
    details: { channel },
  };
}

/** Atomically turns one due occurrence and #1306's already-rendered messages into durable encrypted work. */
export async function enqueueOccurrenceMessages(
  options: { pool: pg.Pool; encryptionKeys: EncryptionKeys },
  occurrenceId: string,
  messages: readonly OccurrenceMessage[],
): Promise<boolean> {
  const channels = new Set(messages.map(({ channel }) => channel));
  if (
    messages.length < 1 ||
    messages.length > 2 ||
    channels.size !== messages.length
  )
    throw new Error('MESSAGE_OCCURRENCE_INVALID');
  const located = await options.pool.query<{ team_id: string }>(
    'SELECT team_id FROM schedule_occurrences WHERE id = $1',
    [occurrenceId],
  );
  const teamId = located.rows[0]?.team_id;
  if (!teamId) return false;
  try {
    return await runAuditedSystemMutation(
      {
        tenantDb: createTenantDb(options.pool, teamId),
        actorLabel: 'Message delivery',
        requestId: randomUUID(),
      },
      async (client, context) => {
        const result = await client.query<{
          study_id: string;
          participant_id: string;
          scheduled_for: Date;
          expires_at: Date;
          state: string;
          channels: Channel[];
          email_index: Buffer | null;
          phone_index: Buffer | null;
          blind_index_key_id: string | null;
        }>(
          `SELECT o.study_id, o.participant_id, o.scheduled_for, o.expires_at, o.state, s.channels,
                p.email_index, p.phone_index, p.blind_index_key_id
         FROM schedule_occurrences o JOIN study_schedules s ON s.id = o.schedule_id AND s.team_id = o.team_id
         JOIN participants p ON p.id = o.participant_id AND p.study_id = o.study_id AND p.team_id = o.team_id
         WHERE o.id = $1 AND o.team_id = $2 FOR UPDATE OF o, p`,
          [occurrenceId, teamId],
        );
        const row = result.rows[0];
        if (!row || row.state !== 'scheduled') throw new NoOccurrenceChange();
        if (row.scheduled_for > new Date()) throw new NoOccurrenceChange();
        if (row.expires_at <= new Date()) {
          await client.query(
            "UPDATE schedule_occurrences SET state = 'expired' WHERE id = $1",
            [occurrenceId],
          );
          return {
            result: true,
            events: [
              messageEvent(
                context,
                occurrenceId,
                'schedule_occurrence',
                'message.occurrence.expired',
                null,
              ),
            ],
          };
        }
        if (
          row.channels.length !== messages.length ||
          row.channels.some((channel) => !channels.has(channel))
        )
          throw new Error('MESSAGE_OCCURRENCE_CHANNELS_MISMATCH');
        if (!row.blind_index_key_id)
          throw new Error('MESSAGE_CONTACT_UNAVAILABLE');
        for (const item of messages) {
          const body = Buffer.from(item.body);
          const deliveryId = randomUUID();
          const recipientIndex =
            item.channel === 'email' ? row.email_index : row.phone_index;
          if (!recipientIndex) throw new Error('MESSAGE_CONTACT_UNAVAILABLE');
          const sealed = sealRenderedMessage(
            options.encryptionKeys,
            teamId,
            deliveryId,
            { subject: item.subject, body: item.body },
          );
          const jitterMs =
            createHash('sha256')
              .update(`${occurrenceId}:${item.channel}`)
              .digest()
              .readUInt16BE(0) % 30_000;
          await client.query(
            `INSERT INTO message_deliveries
             (id, team_id, study_id, participant_id, occurrence_id, template_id, kind, channel,
              recipient_blind_index, blind_index_key_id, rendered_body_hash,
              rendered_ciphertext, rendered_key_id, rendered_algorithm, available_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,clock_timestamp() + make_interval(secs => $15::float / 1000))`,
            [
              deliveryId,
              teamId,
              row.study_id,
              row.participant_id,
              occurrenceId,
              item.templateId,
              item.kind,
              item.channel,
              recipientIndex,
              row.blind_index_key_id,
              createHash('sha256').update(body).digest('hex'),
              sealed.envelope,
              sealed.keyId,
              sealed.algorithm,
              jitterMs,
            ],
          );
          body.fill(0);
        }
        await client.query(
          "UPDATE schedule_occurrences SET state = 'dispatched' WHERE id = $1",
          [occurrenceId],
        );
        return {
          result: true,
          events: [
            messageEvent(
              context,
              occurrenceId,
              'schedule_occurrence',
              'message.occurrence.dispatched',
              null,
            ),
          ],
        };
      },
    );
  } catch (error) {
    if (error instanceof NoOccurrenceChange) return false;
    throw error;
  }
}

class MessageDeliveryAdapter implements OutboxAdapter<ClaimedMessageDelivery> {
  readonly queue = QUEUE;
  private readonly options: Options;
  constructor(options: Options) {
    this.options = options;
  }
  failureDisposition(error: unknown) {
    if (
      error instanceof EmailDeliveryError ||
      error instanceof SmsDeliveryError
    )
      return error.disposition;
    return error instanceof ProtectedDataError ? 'permanent' : 'uncertain';
  }
  async suppressUndeliverable(): Promise<number> {
    const rows = await this.options.pool.query<ClaimedMessageDelivery>(
      `${this.select()} WHERE ${PENDING} AND d.send_started_at IS NULL AND (
         EXISTS (SELECT 1 FROM participant_contact_optouts o WHERE o.channel = d.channel AND o.blind_index_key_id = d.blind_index_key_id AND o.recipient_blind_index = d.recipient_blind_index)
         OR EXISTS (SELECT 1 FROM schedule_occurrences so WHERE so.id = d.occurrence_id AND so.expires_at <= clock_timestamp()))
       ORDER BY d.created_at,d.id LIMIT 100`,
    );
    let count = 0;
    for (const row of rows.rows)
      if (await this.finish(row, 'suppressed', 'suppressible')) count += 1;
    return count;
  }
  async reconcileExpiredUncertainLeases(): Promise<number> {
    const rows = await this.options.pool.query<ClaimedMessageDelivery>(
      `${this.select()} WHERE ${PENDING} AND d.lease_expires_at <= clock_timestamp() AND d.send_started_at IS NOT NULL ORDER BY d.created_at LIMIT 100`,
    );
    let count = 0;
    for (const row of rows.rows)
      if (await this.finish(row, 'uncertain', 'expired')) count += 1;
    return count;
  }
  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    const rows = await this.options.pool.query<ClaimedMessageDelivery>(
      `${this.select()} WHERE ${PENDING} AND d.lease_expires_at <= clock_timestamp() AND d.send_started_at IS NULL AND d.attempt_count >= $1 ORDER BY d.created_at LIMIT 100`,
      [maxAttempts],
    );
    let count = 0;
    for (const row of rows.rows)
      if (await this.finish(row, 'failed', 'expired')) count += 1;
    return count;
  }
  async claim(
    lease: OutboxLease,
    maxAttempts: number,
  ): Promise<ClaimedMessageDelivery | null> {
    const client = await this.options.pool.connect();
    try {
      await client.query('BEGIN');
      const candidate = await client.query<
        Omit<ClaimedMessageDelivery, 'leaseOwner' | 'sendStartedAt'>
      >(
        `${this.select()} WHERE ${PENDING} AND d.send_started_at IS NULL AND d.attempt_count < $1 AND d.available_at <= clock_timestamp()
         AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= clock_timestamp())
         AND NOT EXISTS (SELECT 1 FROM message_deliveries active
           WHERE active.team_id=d.team_id AND active.participant_id=d.participant_id AND active.id<>d.id
             AND active.lease_expires_at>clock_timestamp() AND active.sent_at IS NULL AND active.failed_at IS NULL
             AND active.suppressed_at IS NULL AND active.uncertain_at IS NULL)
         ORDER BY d.available_at,d.created_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1`,
        [maxAttempts],
      );
      const row = candidate.rows[0];
      if (!row) return null;
      const locked = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS locked',
        [row.teamId, row.participantId],
      );
      if (!locked.rows[0]?.locked) return null;
      const updated = await client.query(
        `UPDATE message_deliveries SET lease_owner=$2, lease_expires_at=clock_timestamp()+make_interval(secs=>$3::float/1000), attempt_count=attempt_count+1 WHERE id=$1 AND ${PENDING}`,
        [row.id, lease.owner, lease.durationMs],
      );
      if (updated.rowCount !== 1)
        throw new Error('message delivery claim failed');
      await client.query('COMMIT');
      return {
        ...row,
        attemptCount: row.attemptCount + 1,
        leaseOwner: lease.owner,
        sendStartedAt: null,
      };
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }
  async remainsDeliverable(
    claim: ClaimedMessageDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    const result = await this.options.pool.query(
      `SELECT 1 FROM message_deliveries d LEFT JOIN schedule_occurrences so ON so.id=d.occurrence_id
       WHERE d.${OWNED} AND (so.id IS NULL OR so.expires_at > clock_timestamp())
       AND NOT EXISTS (SELECT 1 FROM participant_contact_optouts o WHERE o.channel=d.channel AND o.blind_index_key_id=d.blind_index_key_id AND o.recipient_blind_index=d.recipient_blind_index)`,
      [claim.id, lease.owner],
    );
    return result.rowCount === 1;
  }
  suppressClaim(claim: ClaimedMessageDelivery, lease: OutboxLease) {
    return this.finish(claim, 'suppressed', 'owned', lease.owner);
  }
  async renewLease(claim: ClaimedMessageDelivery, lease: OutboxLease) {
    const result = await this.options.pool.query(
      `UPDATE message_deliveries SET lease_expires_at=clock_timestamp()+make_interval(secs=>$3::float/1000) WHERE ${OWNED}`,
      [claim.id, lease.owner, lease.durationMs],
    );
    return result.rowCount === 1;
  }
  async deliver(claim: ClaimedMessageDelivery): Promise<void | 'suppressed'> {
    let contact: Buffer | undefined;
    try {
      const provider =
        claim.channel === 'email' ? this.options.email : this.options.sms;
      if (!provider)
        throw claim.channel === 'email'
          ? new EmailDeliveryError('permanent')
          : new SmsDeliveryError('permanent');
      const authority = {
        teamId: claim.teamId,
        deliveryId: claim.id,
        leaseOwner: claim.leaseOwner,
      };
      const rendered = await readRenderedMessage(
        this.options.encryptionKeys,
        this.options.pool,
        authority,
      );
      if (
        createHash('sha256').update(rendered.body).digest('hex') !==
        claim.renderedBodyHash
      )
        throw new ProtectedDataError();
      contact = await readDeliveryContact(
        this.options.encryptionKeys,
        this.options.pool,
        authority,
      );
      const contactKind = claim.channel === 'email' ? 'email' : 'phone';
      const address = normalizeContact({
        kind: contactKind,
        value: contact.toString('utf8'),
      });
      const currentIndex = createContactBlindIndex(
        this.options.encryptionKeys,
        { kind: contactKind, value: address },
        claim.blindIndexKeyId,
      );
      if (!currentIndex.value.equals(claim.recipientBlindIndex))
        throw new ProtectedDataError();
      const handoff = await this.options.pool.query(
        `UPDATE message_deliveries d SET send_started_at=clock_timestamp(), provider=$3
         WHERE ${OWNED} AND send_started_at IS NULL AND NOT EXISTS
         (SELECT 1 FROM participant_contact_optouts o WHERE o.channel=d.channel AND o.blind_index_key_id=d.blind_index_key_id AND o.recipient_blind_index=d.recipient_blind_index)
         AND EXISTS (SELECT 1 FROM participants p WHERE p.id=d.participant_id AND p.study_id=d.study_id AND p.team_id=d.team_id
           AND p.blind_index_key_id=d.blind_index_key_id
           AND CASE WHEN d.channel='email' THEN p.email_index ELSE p.phone_index END=d.recipient_blind_index)`,
        [claim.id, claim.leaseOwner, provider.provider],
      );
      if (handoff.rowCount !== 1) return 'suppressed';
      if (claim.channel === 'email') {
        if (!rendered.subject || !this.options.email)
          throw new EmailDeliveryError('permanent');
        const receipt = await this.options.email.sender.send({
          from: this.options.email.from,
          to: address,
          subject: rendered.subject,
          text: rendered.body,
          messageId: `<${claim.id}@studio.networkcanvas.local>`,
          metadata: { deliveryId: claim.id },
        });
        claim.providerMessageId =
          receipt.providerMessageId ?? receipt.messageId;
      } else {
        if (rendered.subject || !this.options.sms)
          throw new SmsDeliveryError('permanent');
        claim.providerMessageId = (
          await this.options.sms.sender.send({
            to: address,
            body: rendered.body,
            deliveryId: claim.id,
          })
        ).providerMessageId;
      }
    } finally {
      contact?.fill(0);
    }
  }
  async recordFailure(
    claim: ClaimedMessageDelivery,
    lease: OutboxLease,
    _error: unknown,
    retryDelayMs: number | null,
  ) {
    if (retryDelayMs === null)
      return this.finish(claim, 'failed', 'owned', lease.owner);
    const result = await this.options.pool.query(
      `UPDATE message_deliveries SET send_started_at=NULL, provider=NULL, lease_owner=NULL, lease_expires_at=NULL, available_at=clock_timestamp()+make_interval(secs=>$3::float/1000), last_error='delivery_retryable' WHERE ${OWNED}`,
      [claim.id, lease.owner, retryDelayMs],
    );
    return result.rowCount === 1;
  }
  recordComplete(claim: ClaimedMessageDelivery, lease: OutboxLease) {
    return this.finish(claim, 'delivered', 'owned', lease.owner);
  }
  recordUncertain(
    claim: ClaimedMessageDelivery,
    lease: OutboxLease,
    _error: unknown,
  ) {
    return this.finish(claim, 'uncertain', 'owned', lease.owner);
  }
  private select() {
    return `SELECT d.id,d.team_id AS "teamId",d.study_id AS "studyId",d.participant_id AS "participantId",d.occurrence_id AS "occurrenceId",d.channel,d.kind,d.recipient_blind_index AS "recipientBlindIndex",d.blind_index_key_id AS "blindIndexKeyId",d.rendered_body_hash AS "renderedBodyHash",d.attempt_count AS "attemptCount",d.lease_owner AS "leaseOwner",d.send_started_at AS "sendStartedAt" FROM message_deliveries d`;
  }
  private async finish(
    claim: ClaimedMessageDelivery,
    outcome: 'delivered' | 'failed' | 'uncertain' | 'suppressed',
    ownership: 'owned' | 'expired' | 'suppressible',
    owner = claim.leaseOwner,
  ): Promise<boolean> {
    try {
      return await runAuditedSystemMutation(
        {
          tenantDb: createTenantDb(this.options.pool, claim.teamId),
          actorLabel: 'Message delivery',
          requestId: randomUUID(),
        },
        async (client, context) => {
          const where =
            ownership === 'owned'
              ? `id=$1 AND lease_owner=$2 AND ${PENDING}`
              : ownership === 'expired'
                ? `id=$1 AND lease_owner=$2 AND lease_expires_at<=clock_timestamp() AND ${PENDING}`
                : `id=$1 AND send_started_at IS NULL AND ${PENDING} AND (
                    EXISTS (SELECT 1 FROM participant_contact_optouts o WHERE o.channel=message_deliveries.channel AND o.blind_index_key_id=message_deliveries.blind_index_key_id AND o.recipient_blind_index=message_deliveries.recipient_blind_index)
                    OR EXISTS (SELECT 1 FROM schedule_occurrences so WHERE so.id=message_deliveries.occurrence_id AND so.expires_at<=clock_timestamp()))`;
          const outcomeParameter = ownership === 'suppressible' ? '$2' : '$3';
          const providerIdParameter =
            ownership === 'suppressible' ? '$3' : '$4';
          const parameters =
            ownership === 'suppressible'
              ? [claim.id, outcome, claim.providerMessageId ?? null]
              : [claim.id, owner, outcome, claim.providerMessageId ?? null];
          const result = await client.query(
            `UPDATE message_deliveries SET sent_at=CASE WHEN ${outcomeParameter}='delivered' THEN clock_timestamp() END,
           failed_at=CASE WHEN ${outcomeParameter}='failed' THEN clock_timestamp() END, suppressed_at=CASE WHEN ${outcomeParameter}='suppressed' THEN clock_timestamp() END,
           uncertain_at=CASE WHEN ${outcomeParameter}='uncertain' THEN clock_timestamp() END, provider_message_id=CASE WHEN ${outcomeParameter}='delivered' THEN ${providerIdParameter} ELSE provider_message_id END,
           lease_owner=NULL,lease_expires_at=NULL,last_error=CASE WHEN ${outcomeParameter}='delivered' THEN NULL ELSE 'delivery_'||${outcomeParameter} END WHERE ${where}`,
            parameters,
          );
          if (result.rowCount !== 1) throw new LeaseLost();
          return {
            result: true,
            events: [
              messageEvent(
                context,
                claim.id,
                'message_delivery',
                `message.delivery.${outcome}`,
                claim.channel,
              ),
            ],
          };
        },
      );
    } catch (error) {
      if (error instanceof LeaseLost) return false;
      throw error;
    }
  }
}

export function createMessageDeliveryDispatcher(options: Options) {
  return new OutboxDispatcher({
    ...options,
    adapter: new MessageDeliveryAdapter(options),
  });
}
export type MessageDeliveryWorker = OutboxWorker;
export function startMessageDeliveryWorker(
  options: Options & {
    pollIntervalMs?: number;
    drainLimit?: number;
    reportError?: (error: unknown) => void | Promise<void>;
  },
): MessageDeliveryWorker {
  const dispatcher = createMessageDeliveryDispatcher(options);
  return startOutboxWorker({
    queue: QUEUE,
    observer: options.observer,
    pollIntervalMs: options.pollIntervalMs,
    drainLimit: options.drainLimit,
    onError: options.reportError,
    runOnce: () => dispatcher.runOnce(),
  });
}
