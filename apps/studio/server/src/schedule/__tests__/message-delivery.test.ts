import { createHash, createHmac, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  EmailDeliveryError,
  type EmailMessage,
} from '@codaco/studio-sync/email-sender';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import { createHttpTestApp } from '../../__tests__/support/http-app.ts';
import { readEnv } from '../../env.ts';
import {
  participantFixture,
  contacts,
} from '../../pii/__tests__/integration-fixture.ts';
import { updateParticipantPii } from '../../pii/participants.ts';
import {
  createMessageDeliveryDispatcher,
  enqueueOccurrenceMessages,
  MessageDeliveryAdapter,
} from '../message-delivery.ts';
import {
  receivePostmarkStatus,
  receiveTwilioStatus,
} from '../message-status.ts';

let templateVersion = 0;
async function occurrence(
  fixture: Parameters<Parameters<typeof participantFixture>[0]>[0],
  expired = false,
  channel: 'email' | 'sms' = 'email',
) {
  await updateParticipantPii(fixture.keys, fixture.context, fixture.target, {
    email: contacts.email,
    phone: contacts.phone,
    name: null,
    attributes: null,
  });
  const scheduleId = randomUUID();
  const occurrenceId = randomUUID();
  const templateId = randomUUID();
  await fixture.scratch.pool.query(
    `INSERT INTO study_schedules
      (id,team_id,study_id,name,state,anchor_kind,recurrence_kind,window_start_minute,window_end_minute,days_of_week_mask,max_prompts_per_day,prompt_expiry_hours,catch_up_policy,fallback_time_zone,channels)
     VALUES ($1,$2,$3,'Prompt','active','enrolment','one_off',0,1439,127,1,24,'skip','UTC',ARRAY[$4]::text[])`,
    [
      scheduleId,
      fixture.context.tenantDb.teamId,
      fixture.target.studyId,
      channel,
    ],
  );
  await fixture.scratch.pool.query(
    `INSERT INTO schedule_occurrences
      (id,team_id,study_id,schedule_id,participant_id,occurrence_index,scheduled_for,scheduled_local_date,scheduled_local_minute,resolved_time_zone,expires_at)
     VALUES ($1,$2,$3,$4,$5,1,clock_timestamp()-interval '1 minute',current_date,600,'UTC',clock_timestamp()+make_interval(secs=>$6))`,
    [
      occurrenceId,
      fixture.context.tenantDb.teamId,
      fixture.target.studyId,
      scheduleId,
      fixture.target.participantId,
      expired ? -1 : 3600,
    ],
  );
  await fixture.scratch.pool.query(
    `INSERT INTO message_templates (id,team_id,study_id,kind,channel,locale,version,state,subject,body)
     VALUES ($1,$2,$3,'prompt',$4,'en',$5,'published',$6,'Use {{interviewLink}}')`,
    [
      templateId,
      fixture.context.tenantDb.teamId,
      fixture.target.studyId,
      channel,
      ++templateVersion,
      channel === 'email' ? 'A prompt' : null,
    ],
  );
  return { occurrenceId, templateId };
}

describe('message delivery runtime', () => {
  it('atomically produces one encrypted delivery and sends the exact body through the shared dispatcher', async () => {
    await participantFixture(async (fixture) => {
      const { occurrenceId, templateId } = await occurrence(fixture);
      const body = 'Open https://studio.example/interview/opaque-token';
      expect(
        await enqueueOccurrenceMessages(
          { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
          occurrenceId,
          [
            {
              channel: 'email',
              templateId,
              kind: 'prompt',
              subject: 'Your prompt',
              body,
            },
          ],
        ),
      ).toBe(true);
      expect(
        await enqueueOccurrenceMessages(
          { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
          occurrenceId,
          [
            {
              channel: 'email',
              templateId,
              kind: 'prompt',
              subject: 'Your prompt',
              body,
            },
          ],
        ),
      ).toBe(false);
      const stored = await fixture.scratch.pool.query<{
        rendered_ciphertext: Buffer;
        rendered_body_hash: string;
      }>(
        'UPDATE message_deliveries SET available_at=clock_timestamp() RETURNING rendered_ciphertext,rendered_body_hash',
      );
      expect(
        stored.rows[0]?.rendered_ciphertext.includes(Buffer.from(body)),
      ).toBe(false);
      expect(stored.rows[0]?.rendered_body_hash).toBe(
        createHash('sha256').update(body).digest('hex'),
      );

      const sent: EmailMessage[] = [];
      const dispatcher = createMessageDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        retryBaseMs: 0,
        retryMaxMs: 0,
        email: {
          provider: 'postmark',
          from: 'studio@example.org',
          sender: {
            async send(message) {
              sent.push(message);
              return {
                status: 'accepted',
                messageId: message.messageId!,
                providerMessageId: randomUUID(),
              };
            },
            close() {},
          },
        },
      });
      expect(await dispatcher.runOnce()).toMatchObject({
        claimed: 1,
        completed: 1,
      });
      expect(sent).toMatchObject([
        { to: 'person@example.org', subject: 'Your prompt', text: body },
      ]);
      const result = await fixture.scratch.pool.query(
        `SELECT sent_at IS NOT NULL AS sent,provider,provider_message_id,rendered_ciphertext FROM message_deliveries`,
      );
      expect(result.rows[0]).toMatchObject({
        sent: true,
        provider: 'postmark',
      });
      expect(JSON.stringify(result.rows)).not.toContain('opaque-token');
      const events = await fixture.scratch.pool.query<{ event_type: string }>(
        "SELECT event_type FROM audit_events WHERE event_type LIKE 'message.%' ORDER BY sequence",
      );
      expect(events.rows.map(({ event_type }) => event_type)).toEqual([
        'message.occurrence.dispatched',
        'message.payload.read',
        'message.contact.read',
        'message.delivery.delivered',
      ]);
    });
  });

  it('expires without creating work and suppresses an opted-out recipient before PII is read', async () => {
    await participantFixture(async (fixture) => {
      const expired = await occurrence(fixture, true);
      expect(
        await enqueueOccurrenceMessages(
          { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
          expired.occurrenceId,
          [
            {
              channel: 'email',
              templateId: expired.templateId,
              kind: 'prompt',
              subject: 'Expired',
              body: 'Expired body',
            },
          ],
        ),
      ).toBe(true);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT count(*)::int AS n FROM message_deliveries',
          )
        ).rows[0],
      ).toEqual({ n: 0 });

      const paused = await occurrence(fixture);
      await fixture.scratch.pool.query(
        `UPDATE study_schedules SET state='paused' WHERE id=(SELECT schedule_id FROM schedule_occurrences WHERE id=$1)`,
        [paused.occurrenceId],
      );
      await expect(
        enqueueOccurrenceMessages(
          { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
          paused.occurrenceId,
          [
            {
              channel: 'email',
              templateId: paused.templateId,
              kind: 'prompt',
              subject: 'Paused',
              body: 'Paused body',
            },
          ],
        ),
      ).resolves.toBe(false);

      const active = await occurrence(fixture);
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        active.occurrenceId,
        [
          {
            channel: 'email',
            templateId: active.templateId,
            kind: 'prompt',
            subject: 'Suppressed',
            body: 'Never sent',
          },
        ],
      );
      await fixture.scratch.pool
        .query(`INSERT INTO participant_contact_optouts(channel,recipient_blind_index,blind_index_key_id,source)
        SELECT channel,recipient_blind_index,blind_index_key_id,'researcher' FROM message_deliveries`);
      let sends = 0;
      const dispatcher = createMessageDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        email: {
          provider: 'smtp',
          from: 'studio@example.org',
          sender: {
            async send() {
              sends += 1;
              throw new Error('must not send');
            },
            close() {},
          },
        },
      });
      expect(await dispatcher.runOnce()).toMatchObject({
        suppressed: 1,
        claimed: 0,
      });
      expect(sends).toBe(0);
      expect(
        (
          await fixture.scratch.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE event_type IN ('message.payload.read','message.contact.read')",
          )
        ).rows[0],
      ).toEqual({ n: 0 });
      expect(
        (
          await fixture.scratch.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'message.delivery.suppressed'",
          )
        ).rows[0],
      ).toEqual({ n: 1 });
    });
  });

  it('retries a proven provider rejection but never retries an ambiguous handoff', async () => {
    await participantFixture(async (fixture) => {
      const first = await occurrence(fixture);
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        first.occurrenceId,
        [
          {
            channel: 'email',
            templateId: first.templateId,
            kind: 'prompt',
            subject: 'Retry',
            body: 'Retry body',
          },
        ],
      );
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp()',
      );
      let disposition: 'retryable' | 'uncertain' = 'retryable';
      let sends = 0;
      const dispatcher = createMessageDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        retryBaseMs: 0,
        retryMaxMs: 0,
        email: {
          provider: 'postmark',
          from: 'studio@example.org',
          sender: {
            async send(message) {
              sends += 1;
              if (disposition === 'retryable')
                throw new EmailDeliveryError('retryable');
              throw new Error(`ambiguous after ${message.messageId}`);
            },
            close() {},
          },
        },
      });
      expect(await dispatcher.runOnce()).toMatchObject({ retried: 1 });
      disposition = 'uncertain';
      expect(await dispatcher.runOnce()).toMatchObject({ uncertain: 1 });
      expect(await dispatcher.runOnce()).toMatchObject({ claimed: 0 });
      expect(sends).toBe(2);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT uncertain_at IS NOT NULL AS uncertain,attempt_count FROM message_deliveries',
          )
        ).rows[0],
      ).toEqual({ uncertain: true, attempt_count: 2 });
    });
  });

  it('authenticates and idempotently records Postmark and Twilio status callbacks, suppressing provider bounces', async () => {
    await participantFixture(async (fixture) => {
      const email = await occurrence(fixture);
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        email.occurrenceId,
        [
          {
            channel: 'email',
            templateId: email.templateId,
            kind: 'prompt',
            subject: 'Status',
            body: 'Status body',
          },
        ],
      );
      const postmarkId = randomUUID();
      const emailDelivery = await fixture.scratch.pool.query<{ id: string }>(
        "UPDATE message_deliveries SET provider='postmark',provider_message_id=NULL,send_started_at=clock_timestamp(),sent_at=clock_timestamp() RETURNING id",
      );
      const postmarkBody = JSON.stringify({
        MessageID: postmarkId,
        RecordType: 'Bounce',
        BouncedAt: '2026-09-13T12:00:00.000Z',
        TypeCode: 1,
        Metadata: { deliveryId: emailDelivery.rows[0]!.id },
      });
      const app = createHttpTestApp(readEnv(), {
        auth: stubAuthService(),
        pool: fixture.scratch.app,
        messageStatus: {
          maintenancePool: fixture.scratch.maintenance,
          postmarkToken: 'x'.repeat(32),
        },
      });
      expect(
        (
          await app.request('/api/v1/message-status/postmark', {
            method: 'POST',
            headers: { authorization: `Bearer ${'x'.repeat(32)}` },
            body: JSON.stringify({
              MessageID: randomUUID(),
              RecordType: 'Delivery',
              DeliveredAt: '2026-09-13T12:00:00.000Z',
              Metadata: { deliveryId: randomUUID() },
            }),
          })
        ).status,
      ).toBe(503);
      expect(
        (
          await app.request('/api/v1/message-status/postmark', {
            method: 'POST',
            headers: { authorization: 'Bearer wrong' },
            body: postmarkBody,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await app.request('/api/v1/message-status/postmark', {
            method: 'POST',
            headers: { authorization: `Bearer ${'x'.repeat(32)}` },
            body: postmarkBody,
          })
        ).status,
      ).toBe(204);
      await expect(
        receivePostmarkStatus(fixture.scratch.maintenance, {
          token: 'x'.repeat(32),
          authorization: `Bearer ${'x'.repeat(32)}`,
          body: postmarkBody,
        }),
      ).resolves.toBe(false);
      await expect(
        receivePostmarkStatus(fixture.scratch.maintenance, {
          token: 'x'.repeat(32),
          authorization: `Bearer ${'x'.repeat(32)}`,
          body: JSON.stringify({
            MessageID: randomUUID(),
            RecordType: 'Bounce',
            Metadata: { deliveryId: emailDelivery.rows[0]!.id },
          }),
        }),
      ).rejects.toThrow('MESSAGE_STATUS_INVALID');

      const sms = await occurrence(fixture, false, 'sms');
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        sms.occurrenceId,
        [
          {
            channel: 'sms',
            templateId: sms.templateId,
            kind: 'prompt',
            subject: null,
            body: 'SMS status',
          },
        ],
      );
      const delivery = await fixture.scratch.pool.query<{ id: string }>(
        "UPDATE message_deliveries SET provider='twilio',provider_message_id=NULL,send_started_at=clock_timestamp(),sent_at=clock_timestamp() WHERE occurrence_id=$1 RETURNING id",
        [sms.occurrenceId],
      );
      const deliveryId = delivery.rows[0]!.id;
      const url = `https://studio.example/api/v1/message-status/twilio/${deliveryId}`;
      const body =
        'MessageSid=SM00000000000000000000000000000000&MessageStatus=undelivered&ErrorCode=30003';
      const signed =
        url +
        'ErrorCode30003' +
        'MessageSidSM00000000000000000000000000000000' +
        'MessageStatusundelivered';
      const signature = createHmac('sha1', 'twilio-secret')
        .update(signed)
        .digest('base64');
      await expect(
        receiveTwilioStatus(fixture.scratch.maintenance, {
          authToken: 'twilio-secret',
          signature: 'wrong',
          url,
          body,
          deliveryId,
        }),
      ).rejects.toThrow('MESSAGE_STATUS_UNAUTHORIZED');
      await expect(
        receiveTwilioStatus(fixture.scratch.maintenance, {
          authToken: 'twilio-secret',
          signature,
          url,
          body,
          deliveryId,
        }),
      ).resolves.toBe(true);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT count(*)::int AS n FROM message_delivery_events',
          )
        ).rows[0],
      ).toEqual({ n: 2 });
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT count(*)::int AS n FROM participant_contact_optouts',
          )
        ).rows[0],
      ).toEqual({ n: 1 });

      const optoutBody =
        'MessageSid=SM00000000000000000000000000000000&MessageStatus=failed&ErrorCode=21610';
      const optoutSignature = createHmac('sha1', 'twilio-secret')
        .update(
          url +
            'ErrorCode21610' +
            'MessageSidSM00000000000000000000000000000000' +
            'MessageStatusfailed',
        )
        .digest('base64');
      await expect(
        receiveTwilioStatus(fixture.scratch.maintenance, {
          authToken: 'twilio-secret',
          signature: optoutSignature,
          url,
          body: optoutBody,
          deliveryId,
        }),
      ).resolves.toBe(true);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT count(*)::int AS n FROM participant_contact_optouts',
          )
        ).rows[0],
      ).toEqual({ n: 2 });
      expect(
        (
          await fixture.scratch.pool.query(
            "SELECT provider_message_id,count(*) OVER()::int AS status_events FROM message_deliveries d JOIN audit_events a ON a.resource_id=d.id::text AND a.event_type='message.delivery.status_received' WHERE d.id=$1",
            [deliveryId],
          )
        ).rows[0],
      ).toEqual({
        provider_message_id: 'SM00000000000000000000000000000000',
        status_events: 2,
      });
    });
  });

  it('holds one participant delivery lease across providers and refuses a tampered body identity', async () => {
    await participantFixture(async (fixture) => {
      const email = await occurrence(fixture);
      const sms = await occurrence(fixture, false, 'sms');
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        email.occurrenceId,
        [
          {
            channel: 'email',
            templateId: email.templateId,
            kind: 'prompt',
            subject: 'Email',
            body: 'Email body',
          },
        ],
      );
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        sms.occurrenceId,
        [
          {
            channel: 'sms',
            templateId: sms.templateId,
            kind: 'prompt',
            subject: null,
            body: 'SMS body',
          },
        ],
      );
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp()',
      );
      const gate = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      let sends = 0;
      const providers = {
        email: {
          provider: 'smtp' as const,
          from: 'studio@example.org',
          sender: {
            async send(message: EmailMessage) {
              sends += 1;
              started.resolve();
              await gate.promise;
              return {
                status: 'accepted' as const,
                messageId: message.messageId!,
              };
            },
            close() {},
          },
        },
        sms: {
          provider: 'twilio' as const,
          sender: {
            async send() {
              sends += 1;
              started.resolve();
              await gate.promise;
              return {
                status: 'accepted' as const,
                providerMessageId: 'SM00000000000000000000000000000000',
              };
            },
            close() {},
          },
        },
      };
      const first = createMessageDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        ...providers,
      });
      const second = createMessageDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        ...providers,
      });
      const active = first.runOnce();
      await started.promise;
      expect(await second.runOnce()).toMatchObject({ claimed: 0 });
      expect(sends).toBe(1);
      gate.resolve();
      await expect(active).resolves.toMatchObject({ completed: 1 });
      await expect(second.runOnce()).resolves.toMatchObject({
        claimed: 1,
        completed: 1,
      });

      const third = await occurrence(fixture);
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        third.occurrenceId,
        [
          {
            channel: 'email',
            templateId: third.templateId,
            kind: 'prompt',
            subject: 'Tamper',
            body: 'Original',
          },
        ],
      );
      await fixture.scratch.pool.query(
        'ALTER TABLE message_deliveries DISABLE TRIGGER message_delivery_payload_immutable',
      );
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET rendered_body_hash=$2,available_at=clock_timestamp() WHERE occurrence_id=$1',
        [third.occurrenceId, '0'.repeat(64)],
      );
      await fixture.scratch.pool.query(
        'ALTER TABLE message_deliveries ENABLE TRIGGER message_delivery_payload_immutable',
      );
      expect(await second.runOnce()).toMatchObject({ claimed: 1, failed: 1 });
      expect(sends).toBe(2);
    });
  });

  it('refuses provider handoff after the database lease expires or the schedule pauses', async () => {
    await participantFixture(async (fixture) => {
      const first = await occurrence(fixture);
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        first.occurrenceId,
        [
          {
            channel: 'email',
            templateId: first.templateId,
            kind: 'prompt',
            subject: 'Boundary',
            body: 'Never handed off',
          },
        ],
      );
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp()',
      );
      let sends = 0;
      const sender = {
        async send() {
          sends += 1;
          throw new Error('must not send');
        },
        close() {},
      };
      const adapter = new MessageDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        email: {
          provider: 'smtp',
          from: 'studio@example.org',
          sender,
        },
      });
      const owner = randomUUID();
      const claim = await adapter.claim({ owner, durationMs: 1 }, 3);
      if (!claim) throw new Error('expected delivery claim');
      await new Promise((resolve) => setTimeout(resolve, 5));
      await expect(
        adapter.renewLease(claim, { owner, durationMs: 5_000 }),
      ).resolves.toBe(false);
      await expect(adapter.deliver(claim)).rejects.toThrow(
        'Stored encrypted data could not be read',
      );
      expect(sends).toBe(0);

      await fixture.scratch.pool.query(
        `UPDATE message_deliveries SET lease_owner=NULL,lease_expires_at=NULL,available_at=clock_timestamp()
         WHERE id=$1`,
        [claim.id],
      );
      await fixture.scratch.pool.query(
        `UPDATE study_schedules SET state='paused' WHERE id=(SELECT schedule_id FROM schedule_occurrences WHERE id=$1)`,
        [first.occurrenceId],
      );
      const dispatcher = createMessageDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        email: {
          provider: 'smtp',
          from: 'studio@example.org',
          sender,
        },
      });
      await expect(dispatcher.runOnce()).resolves.toMatchObject({
        claimed: 1,
        suppressed: 1,
      });
      expect(sends).toBe(0);
    });
  });
});
