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
import {
  linkSnapshotMatches,
  readInterviewLinkCapability,
  type InterviewLinkCiphertext,
} from '../pii/interview-links.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import {
  readDeliveryContact,
  readRenderedMessage,
  sealRenderedMessage,
  RenderedMessageSchema,
  type RenderedMessage,
} from '../pii/message-deliveries.ts';
import { ProtectedDataError } from '../pii/protection.ts';
import {
  lockMessageRecipientAuthority,
  lockParticipantMessageAuthority,
  tryLockParticipantMessageAuthority,
} from './participant-authority.ts';

const QUEUE = 'message_deliveries';
const PENDING =
  'sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL';
const OWNED = `id = $1 AND lease_owner = $2 AND ${PENDING}`;

/** Postmark scheduled sends require their suppression callback to be configured. */
export function scheduledEmailDeliveryEnabled(
  kind: 'smtp' | 'postmark' | undefined,
  postmarkWebhookToken: string | undefined,
): boolean {
  return (
    kind === 'smtp' || (kind === 'postmark' && Boolean(postmarkWebhookToken))
  );
}

type Channel = 'email' | 'sms';
export type OccurrenceMessage = RenderedMessage & {
  channel: Channel;
  templateId: string;
  kind: 'invitation' | 'prompt' | 'reminder' | 'custom';
};

type EnqueueOptions = {
  pool: pg.Pool;
  encryptionKeys: EncryptionKeys;
  linkSnapshot?: InterviewLinkCiphertext;
};

type ClaimedMessageDelivery = {
  id: string;
  teamId: string;
  studyId: string;
  participantId: string;
  occurrenceId: string | null;
  interviewLinkId: string | null;
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
    | 'message.occurrence.blocked'
    | 'message.occurrence.expired'
    | 'message.delivery.accepted'
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

async function transitionScheduledOccurrence(
  pool: pg.Pool,
  row: { occurrenceId: string; teamId: string },
  state: 'blocked' | 'expired',
): Promise<boolean> {
  try {
    return await runAuditedSystemMutation(
      {
        tenantDb: createTenantDb(pool, row.teamId),
        actorLabel: 'Message delivery',
        requestId: randomUUID(),
      },
      async (client, context) => {
        const updated = await client.query(
          `UPDATE schedule_occurrences SET state=$3
           WHERE id=$1 AND team_id=$2 AND state='scheduled'
             AND ($3<>'expired' OR expires_at<=statement_timestamp())`,
          [row.occurrenceId, row.teamId, state],
        );
        if (updated.rowCount !== 1) throw new NoOccurrenceChange();
        return {
          result: true,
          events: [
            messageEvent(
              context,
              row.occurrenceId,
              'schedule_occurrence',
              `message.occurrence.${state}`,
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

/** Bounded expiry sweep for stale scheduled work that can no longer enqueue. */
export async function expireScheduledOccurrences(
  pool: pg.Pool,
  limit = 100,
): Promise<number> {
  const candidates = await pool.query<{
    occurrence_id: string;
    team_id: string;
  }>(
    `SELECT id AS occurrence_id,team_id FROM schedule_occurrences
     WHERE state='scheduled' AND expires_at<=statement_timestamp()
     ORDER BY expires_at,id LIMIT $1`,
    [limit],
  );
  let expired = 0;
  for (const row of candidates.rows) {
    if (
      await transitionScheduledOccurrence(
        pool,
        { occurrenceId: row.occurrence_id, teamId: row.team_id },
        'expired',
      )
    )
      expired += 1;
  }
  return expired;
}

/** Atomically turns one due occurrence and #1306's already-rendered messages into durable encrypted work. */
export async function enqueueOccurrenceMessages(
  options: EnqueueOptions,
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
          schedule_state: string;
          wave_id: string | null;
          due: boolean;
          expired: boolean;
          channels: Channel[];
          email_index: Buffer | null;
          phone_index: Buffer | null;
          blind_index_key_id: string | null;
          withdrawn: boolean;
        }>(
          `SELECT o.study_id, o.participant_id, o.scheduled_for, o.expires_at, o.state,
                s.state AS schedule_state, s.wave_id,
                o.scheduled_for <= statement_timestamp() AS due,
                o.expires_at <= statement_timestamp() AS expired, s.channels,
                p.email_index, p.phone_index, p.blind_index_key_id,
                EXISTS (SELECT 1 FROM participant_consents c
                  WHERE c.team_id=o.team_id AND c.study_id=o.study_id
                    AND c.participant_id=o.participant_id AND c.withdrawn_at IS NOT NULL) AS withdrawn
         FROM schedule_occurrences o JOIN study_schedules s ON s.id = o.schedule_id AND s.team_id = o.team_id
         JOIN participants p ON p.id = o.participant_id AND p.study_id = o.study_id AND p.team_id = o.team_id
         WHERE o.id = $1 AND o.team_id = $2 FOR UPDATE OF o, s, p`,
          [occurrenceId, teamId],
        );
        const row = result.rows[0];
        if (
          !row ||
          row.state !== 'scheduled' ||
          row.schedule_state !== 'active'
        )
          throw new NoOccurrenceChange();
        if (!row.due) throw new NoOccurrenceChange();
        if (row.withdrawn) throw new NoOccurrenceChange();
        if (row.expired) {
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
        if (
          !row.blind_index_key_id ||
          messages.some(
            ({ channel }) =>
              (channel === 'email' ? row.email_index : row.phone_index) ===
              null,
          )
        ) {
          await client.query(
            "UPDATE schedule_occurrences SET state = 'blocked' WHERE id = $1",
            [occurrenceId],
          );
          return {
            result: true,
            events: [
              messageEvent(
                context,
                occurrenceId,
                'schedule_occurrence',
                'message.occurrence.blocked',
                null,
              ),
            ],
          };
        }
        if (options.linkSnapshot) {
          const currentLink = await client.query<InterviewLinkCiphertext>(
            `SELECT id,team_id,study_id,wave_id,participant_id,token_hash,
                    token_ciphertext,token_key_id,token_algorithm
             FROM interview_links WHERE id=$1 AND team_id=$2 AND study_id=$3
               AND participant_id=$4 AND wave_id=$5 AND kind='participant' AND revoked_at IS NULL
               AND (expires_at IS NULL OR expires_at>statement_timestamp())
             FOR UPDATE`,
            [
              options.linkSnapshot.id,
              teamId,
              row.study_id,
              row.participant_id,
              row.wave_id,
            ],
          );
          if (!linkSnapshotMatches(currentLink.rows[0], options.linkSnapshot))
            throw new NoOccurrenceChange();
        }
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
             (id, team_id, study_id, participant_id, occurrence_id, interview_link_id, template_id, kind, channel,
              recipient_blind_index, blind_index_key_id, rendered_body_hash,
              rendered_ciphertext, rendered_key_id, rendered_algorithm, available_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,clock_timestamp() + make_interval(secs => $16::float / 1000))`,
            [
              deliveryId,
              teamId,
              row.study_id,
              row.participant_id,
              occurrenceId,
              options.linkSnapshot?.id ?? null,
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

/** Resolves one due wave occurrence into the encrypted message outbox. */
export async function produceDueOccurrenceMessage(options: {
  pool: pg.Pool;
  encryptionKeys: EncryptionKeys;
  publicBaseUrl: string;
}): Promise<boolean> {
  const candidate = await options.pool.query<{
    occurrence_id: string;
    team_id: string;
    link_id: string;
  }>(
    `SELECT o.id AS occurrence_id,o.team_id,l.id AS link_id
     FROM schedule_occurrences o
     JOIN study_schedules sc ON sc.id=o.schedule_id AND sc.study_id=o.study_id AND sc.team_id=o.team_id
     JOIN study_waves w ON w.id=sc.wave_id AND w.study_id=o.study_id AND w.team_id=o.team_id
     JOIN studies s ON s.id=o.study_id AND s.team_id=o.team_id
     JOIN participants p ON p.id=o.participant_id AND p.study_id=o.study_id AND p.team_id=o.team_id
     JOIN interview_links l ON l.wave_id=sc.wave_id AND l.participant_id=o.participant_id
       AND l.study_id=o.study_id AND l.team_id=o.team_id AND l.kind='participant'
       AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>statement_timestamp())
       AND l.token_ciphertext IS NOT NULL
     WHERE o.state='scheduled' AND o.scheduled_for<=statement_timestamp()
       AND o.expires_at>statement_timestamp() AND sc.state='active' AND sc.wave_id IS NOT NULL
       AND (w.opens_at IS NULL OR w.opens_at<=statement_timestamp())
       AND (w.closes_at IS NULL OR w.closes_at>statement_timestamp())
       AND s.participation_mode='managed' AND s.state='live'
       AND p.enrolled_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM participant_consents c WHERE c.team_id=o.team_id
         AND c.study_id=o.study_id AND c.participant_id=o.participant_id AND c.withdrawn_at IS NOT NULL)
     ORDER BY o.scheduled_for,o.id LIMIT 1`,
  );
  const row = candidate.rows[0];
  if (!row) return false;
  const source = await options.pool.query<{
    study_name: string;
    channels: Channel[];
    template_id: string;
    channel: Channel;
    subject: string | null;
    body: string;
  }>(
    `SELECT s.name AS study_name,sc.channels,t.id AS template_id,t.channel,t.subject,t.body
     FROM schedule_occurrences o
     JOIN study_schedules sc ON sc.id=o.schedule_id AND sc.team_id=o.team_id
     JOIN studies s ON s.id=o.study_id AND s.team_id=o.team_id
     CROSS JOIN LATERAL unnest(sc.channels) requested(channel)
     JOIN LATERAL (
       SELECT mt.id,mt.channel,mt.subject,mt.body
       FROM message_templates mt
       WHERE mt.team_id=o.team_id AND mt.kind='prompt' AND mt.locale='en'
         AND mt.state='published' AND mt.channel=requested.channel
         AND (mt.study_id=o.study_id OR mt.study_id IS NULL)
       ORDER BY (mt.study_id IS NOT NULL) DESC,mt.version DESC LIMIT 1
     ) t ON true
     WHERE o.id=$1 AND o.team_id=$2
     ORDER BY t.channel`,
    [row.occurrence_id, row.team_id],
  );
  if (
    !source.rows[0] ||
    source.rows.length !== source.rows[0].channels.length
  ) {
    await transitionScheduledOccurrence(
      options.pool,
      { occurrenceId: row.occurrence_id, teamId: row.team_id },
      'blocked',
    );
    return false;
  }
  const capability = await readInterviewLinkCapability(
    options.encryptionKeys,
    options.pool,
    row.team_id,
    row.link_id,
  );
  try {
    const origin = new URL(options.publicBaseUrl);
    const token = `${row.team_id}.${capability.secret.toString('utf8')}`;
    const link = new URL(`/enter/${encodeURIComponent(token)}`, origin);
    link.searchParams.set('occurrence', row.occurrence_id);
    const messages = source.rows.map((template) => ({
      channel: template.channel,
      templateId: template.template_id,
      kind: 'prompt' as const,
      subject:
        template.subject?.replaceAll('{{studyName}}', template.study_name) ??
        null,
      body: template.body
        .replaceAll('{{studyName}}', template.study_name)
        .replaceAll('{{interviewLink}}', link.toString()),
    }));
    if (
      source.rows.some(
        (template) => !template.body.includes('{{interviewLink}}'),
      ) ||
      messages.some(
        (message) =>
          !RenderedMessageSchema.safeParse({
            subject: message.subject,
            body: message.body,
          }).success ||
          (message.channel === 'sms' && message.body.length > 1600),
      )
    ) {
      await transitionScheduledOccurrence(
        options.pool,
        { occurrenceId: row.occurrence_id, teamId: row.team_id },
        'blocked',
      );
      return false;
    }
    return enqueueOccurrenceMessages(
      {
        pool: options.pool,
        encryptionKeys: options.encryptionKeys,
        linkSnapshot: capability.snapshot,
      },
      row.occurrence_id,
      messages,
    );
  } finally {
    capability.secret.fill(0);
  }
}

export class MessageDeliveryAdapter implements OutboxAdapter<ClaimedMessageDelivery> {
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
         OR EXISTS (SELECT 1 FROM participant_consents c WHERE c.team_id=d.team_id
           AND c.study_id=d.study_id AND c.participant_id=d.participant_id AND c.withdrawn_at IS NOT NULL)
         OR EXISTS (SELECT 1 FROM schedule_occurrences so WHERE so.id = d.occurrence_id AND so.expires_at <= clock_timestamp())
         OR EXISTS (SELECT 1 FROM interview_links l WHERE l.id=d.interview_link_id
           AND (l.revoked_at IS NOT NULL OR (l.expires_at IS NOT NULL AND l.expires_at<=clock_timestamp()))))
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
      if (
        !(await tryLockParticipantMessageAuthority(
          client,
          row.teamId,
          row.participantId,
        ))
      )
        return null;
      const updated = await client.query(
        `UPDATE message_deliveries d SET lease_owner=$2, lease_expires_at=clock_timestamp()+make_interval(secs=>$3::float/1000), attempt_count=attempt_count+1
         WHERE d.id=$1 AND ${PENDING} AND NOT EXISTS (SELECT 1 FROM message_deliveries active
           WHERE active.team_id=d.team_id AND active.participant_id=d.participant_id AND active.id<>d.id
             AND active.lease_expires_at>clock_timestamp() AND active.sent_at IS NULL AND active.failed_at IS NULL
             AND active.suppressed_at IS NULL AND active.uncertain_at IS NULL)`,
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
      `SELECT 1 FROM message_deliveries d
       LEFT JOIN schedule_occurrences so ON so.id=d.occurrence_id
       LEFT JOIN study_schedules ss ON ss.id=so.schedule_id AND ss.study_id=so.study_id AND ss.team_id=so.team_id
       WHERE d.${OWNED} AND d.lease_expires_at>statement_timestamp()
       AND (so.id IS NULL OR (so.state='dispatched' AND so.expires_at>statement_timestamp() AND ss.state='active'))
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
      `UPDATE message_deliveries SET lease_expires_at=clock_timestamp()+make_interval(secs=>$3::float/1000)
       WHERE ${OWNED} AND lease_expires_at>statement_timestamp()`,
      [claim.id, lease.owner, lease.durationMs],
    );
    return result.rowCount === 1;
  }
  private async beginProviderHandoff(
    claim: ClaimedMessageDelivery,
    provider: 'postmark' | 'smtp' | 'twilio',
  ): Promise<'authorized' | 'suppressed' | 'lease-lost'> {
    const client = await this.options.pool.connect();
    try {
      await client.query('BEGIN');
      const owned = await client.query(
        `SELECT 1 FROM message_deliveries WHERE ${OWNED}
           AND lease_expires_at>statement_timestamp() AND send_started_at IS NULL
         FOR UPDATE`,
        [claim.id, claim.leaseOwner],
      );
      if (owned.rowCount !== 1) return 'lease-lost';
      await lockParticipantMessageAuthority(
        client,
        claim.teamId,
        claim.participantId,
      );
      await lockMessageRecipientAuthority(
        client,
        claim.channel,
        claim.blindIndexKeyId,
        claim.recipientBlindIndex,
      );
      const participant = await client.query(
        `SELECT 1 FROM participants WHERE id=$1 AND study_id=$2 AND team_id=$3
           AND blind_index_key_id=$4
           AND CASE WHEN $5='email' THEN email_index ELSE phone_index END=$6
         FOR UPDATE`,
        [
          claim.participantId,
          claim.studyId,
          claim.teamId,
          claim.blindIndexKeyId,
          claim.channel,
          claim.recipientBlindIndex,
        ],
      );
      if (participant.rowCount !== 1) return 'suppressed';

      if (claim.interviewLinkId) {
        const study = await client.query(
          `SELECT 1 FROM studies WHERE id=$1 AND team_id=$2 AND state='live' FOR UPDATE`,
          [claim.studyId, claim.teamId],
        );
        if (study.rowCount !== 1) return 'suppressed';
      }
      let scheduleWaveId: string | null = null;
      if (claim.occurrenceId) {
        const identity = await client.query<{ schedule_id: string }>(
          `SELECT schedule_id FROM schedule_occurrences
           WHERE id=$1 AND participant_id=$2 AND study_id=$3 AND team_id=$4`,
          [
            claim.occurrenceId,
            claim.participantId,
            claim.studyId,
            claim.teamId,
          ],
        );
        const scheduleId = identity.rows[0]?.schedule_id;
        if (!scheduleId) return 'suppressed';
        const schedule = await client.query<{
          wave_id: string | null;
          state: string;
        }>(
          `SELECT wave_id,state FROM study_schedules
           WHERE id=$1 AND study_id=$2 AND team_id=$3 FOR UPDATE`,
          [scheduleId, claim.studyId, claim.teamId],
        );
        const scheduleRow = schedule.rows[0];
        if (!scheduleRow || scheduleRow.state !== 'active') return 'suppressed';
        scheduleWaveId = scheduleRow.wave_id;
        if (scheduleWaveId) {
          const wave = await client.query(
            `SELECT 1 FROM study_waves
             WHERE id=$1 AND study_id=$2 AND team_id=$3
               AND (opens_at IS NULL OR opens_at<=statement_timestamp())
               AND (closes_at IS NULL OR closes_at>statement_timestamp())
             FOR UPDATE`,
            [scheduleWaveId, claim.studyId, claim.teamId],
          );
          if (wave.rowCount !== 1) return 'suppressed';
        }
        const occurrence = await client.query(
          `SELECT 1 FROM schedule_occurrences
           WHERE id=$1 AND schedule_id=$2 AND participant_id=$3 AND study_id=$4 AND team_id=$5
             AND state='dispatched' AND expires_at>statement_timestamp()
           FOR UPDATE`,
          [
            claim.occurrenceId,
            scheduleId,
            claim.participantId,
            claim.studyId,
            claim.teamId,
          ],
        );
        if (occurrence.rowCount !== 1) return 'suppressed';
      }
      if (claim.interviewLinkId) {
        const link = await client.query(
          `SELECT 1 FROM interview_links
           WHERE id=$1 AND participant_id=$2 AND study_id=$3 AND team_id=$4
             AND kind='participant' AND revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at>statement_timestamp())
             AND ($5::uuid IS NULL OR wave_id=$5)
           FOR UPDATE`,
          [
            claim.interviewLinkId,
            claim.participantId,
            claim.studyId,
            claim.teamId,
            scheduleWaveId,
          ],
        );
        if (link.rowCount !== 1) return 'suppressed';
      }
      const denied = await client.query<{
        withdrawn: boolean;
        opted_out: boolean;
      }>(
        `SELECT
           EXISTS (SELECT 1 FROM participant_consents
             WHERE team_id=$1 AND study_id=$2 AND participant_id=$3 AND withdrawn_at IS NOT NULL) AS withdrawn,
           EXISTS (SELECT 1 FROM participant_contact_optouts
             WHERE channel=$4 AND blind_index_key_id=$5 AND recipient_blind_index=$6) AS opted_out`,
        [
          claim.teamId,
          claim.studyId,
          claim.participantId,
          claim.channel,
          claim.blindIndexKeyId,
          claim.recipientBlindIndex,
        ],
      );
      if (denied.rows[0]?.withdrawn || denied.rows[0]?.opted_out)
        return 'suppressed';
      const handoff = await client.query(
        `UPDATE message_deliveries SET send_started_at=clock_timestamp(),provider=$3
         WHERE ${OWNED} AND lease_expires_at>statement_timestamp() AND send_started_at IS NULL`,
        [claim.id, claim.leaseOwner, provider],
      );
      if (handoff.rowCount !== 1) return 'lease-lost';
      await client.query('COMMIT');
      return 'authorized';
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }
  async deliver(
    claim: ClaimedMessageDelivery,
  ): Promise<void | 'suppressed' | 'lease-lost'> {
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
      const handoff = await this.beginProviderHandoff(claim, provider.provider);
      if (handoff !== 'authorized') return handoff;
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
    return `SELECT d.id,d.team_id AS "teamId",d.study_id AS "studyId",d.participant_id AS "participantId",d.occurrence_id AS "occurrenceId",d.interview_link_id AS "interviewLinkId",d.channel,d.kind,d.recipient_blind_index AS "recipientBlindIndex",d.blind_index_key_id AS "blindIndexKeyId",d.rendered_body_hash AS "renderedBodyHash",d.attempt_count AS "attemptCount",d.lease_owner AS "leaseOwner",d.send_started_at AS "sendStartedAt" FROM message_deliveries d`;
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
                    OR EXISTS (SELECT 1 FROM participant_consents c WHERE c.team_id=message_deliveries.team_id
                      AND c.study_id=message_deliveries.study_id AND c.participant_id=message_deliveries.participant_id AND c.withdrawn_at IS NOT NULL)
                    OR EXISTS (SELECT 1 FROM schedule_occurrences so WHERE so.id=message_deliveries.occurrence_id AND so.expires_at<=clock_timestamp())
                    OR EXISTS (SELECT 1 FROM interview_links l WHERE l.id=message_deliveries.interview_link_id
                      AND (l.revoked_at IS NOT NULL OR (l.expires_at IS NOT NULL AND l.expires_at<=clock_timestamp()))))`;
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
                outcome === 'delivered'
                  ? 'message.delivery.accepted'
                  : `message.delivery.${outcome}`,
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
    publicBaseUrl: string;
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
    runOnce: async () => {
      await expireScheduledOccurrences(options.pool);
      await produceDueOccurrenceMessage(options);
      return dispatcher.runOnce();
    },
  });
}
