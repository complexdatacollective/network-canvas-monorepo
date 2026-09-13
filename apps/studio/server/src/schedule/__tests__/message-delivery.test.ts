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
import { readInterviewLinkCapability } from '../../pii/interview-links.ts';
import { updateParticipantPii } from '../../pii/participants.ts';
import { issueParticipantInterviewLink } from '../../study/interview-links.ts';
import {
  createMessageDeliveryDispatcher,
  enqueueOccurrenceMessages,
  expireScheduledOccurrences,
  MessageDeliveryAdapter,
  produceDueOccurrenceMessage,
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
  waveId: string | null = null,
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
      (id,team_id,study_id,wave_id,name,state,anchor_kind,recurrence_kind,window_start_minute,window_end_minute,days_of_week_mask,max_prompts_per_day,prompt_expiry_hours,catch_up_policy,fallback_time_zone,channels)
     VALUES ($1,$2,$3,$5,'Prompt','active','enrolment','one_off',0,1439,127,1,24,'skip','UTC',ARRAY[$4]::text[])`,
    [
      scheduleId,
      fixture.context.tenantDb.teamId,
      fixture.target.studyId,
      channel,
      waveId,
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

async function waitForAudit(
  fixture: Parameters<Parameters<typeof participantFixture>[0]>[0],
  eventType: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = await fixture.scratch.pool.query(
      'SELECT 1 FROM audit_events WHERE event_type=$1 LIMIT 1',
      [eventType],
    );
    if (found.rowCount === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${eventType}`);
}

describe('message delivery runtime', () => {
  it('issues one encrypted wave capability and reuses it across due occurrence delivery', async () => {
    await participantFixture(async (fixture) => {
      await updateParticipantPii(
        fixture.keys,
        fixture.context,
        fixture.target,
        {
          email: contacts.email,
          phone: contacts.phone,
          name: null,
          attributes: null,
        },
      );
      await fixture.scratch.pool.query(
        "UPDATE studies SET state='live',went_live_at=statement_timestamp() WHERE id=$1",
        [fixture.target.studyId],
      );
      await fixture.scratch.pool.query(
        'UPDATE participants SET enrolled_at=statement_timestamp() WHERE id=$1',
        [fixture.target.participantId],
      );
      const waveId = randomUUID();
      await fixture.scratch.pool.query(
        `INSERT INTO study_waves(id,study_id,team_id,wave_number)
         VALUES($1,$2,$3,1)`,
        [waveId, fixture.target.studyId, fixture.context.tenantDb.teamId],
      );
      const issued = await issueParticipantInterviewLink(
        fixture.keys,
        fixture.context,
        { ...fixture.target, waveId },
      );
      const encodedSecret = issued.token.slice(issued.token.indexOf('.') + 1);
      expect(encodedSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(
        (
          await fixture.scratch.pool.query<{ token_hash: Buffer }>(
            'SELECT token_hash FROM interview_links WHERE id=$1',
            [issued.linkId],
          )
        ).rows[0]?.token_hash,
      ).toEqual(createHash('sha256').update(encodedSecret).digest());
      const first = await occurrence(fixture, false, 'email', waveId);
      await expect(
        produceDueOccurrenceMessage({
          pool: fixture.scratch.maintenance,
          encryptionKeys: fixture.keys,
          publicBaseUrl: 'https://studio.example',
        }),
      ).resolves.toBe(true);
      const atRest = await fixture.scratch.pool.query<{
        interview_link_id: string;
        rendered_ciphertext: Buffer;
      }>(
        'SELECT interview_link_id,rendered_ciphertext FROM message_deliveries WHERE occurrence_id=$1',
        [first.occurrenceId],
      );
      expect(atRest.rows[0]?.interview_link_id).toBe(issued.linkId);
      expect(atRest.rows[0]?.rendered_ciphertext.includes(issued.token)).toBe(
        false,
      );

      const bodies: string[] = [];
      const dispatcher = createMessageDeliveryDispatcher({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        email: {
          provider: 'smtp',
          from: 'studio@example.org',
          sender: {
            async send(message) {
              bodies.push(message.text);
              return {
                status: 'accepted' as const,
                messageId: `receipt-${bodies.length}`,
              };
            },
            close() {},
          },
        },
      });
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp()',
      );
      await expect(dispatcher.runOnce()).resolves.toMatchObject({ claimed: 1 });

      const second = await occurrence(fixture, false, 'email', waveId);
      await expect(
        produceDueOccurrenceMessage({
          pool: fixture.scratch.maintenance,
          encryptionKeys: fixture.keys,
          publicBaseUrl: 'https://studio.example',
        }),
      ).resolves.toBe(true);
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp() WHERE occurrence_id=$1',
        [second.occurrenceId],
      );
      await expect(dispatcher.runOnce()).resolves.toMatchObject({ claimed: 1 });
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toContain(encodeURIComponent(issued.token));
      expect(bodies[0]).toContain(`occurrence=${first.occurrenceId}`);
      expect(bodies[1]).toContain(encodeURIComponent(issued.token));
      expect(bodies[1]).toContain(`occurrence=${second.occurrenceId}`);

      const revokedBeforeHandoff = await occurrence(
        fixture,
        false,
        'email',
        waveId,
      );
      await expect(
        produceDueOccurrenceMessage({
          pool: fixture.scratch.maintenance,
          encryptionKeys: fixture.keys,
          publicBaseUrl: 'https://studio.example',
        }),
      ).resolves.toBe(true);
      const held = await readInterviewLinkCapability(
        fixture.keys,
        fixture.scratch.maintenance,
        fixture.context.tenantDb.teamId,
        issued.linkId,
      );
      const reissued = await issueParticipantInterviewLink(
        fixture.keys,
        fixture.context,
        { ...fixture.target, waveId },
      );
      expect(reissued.linkId).not.toBe(issued.linkId);
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp() WHERE occurrence_id=$1',
        [revokedBeforeHandoff.occurrenceId],
      );
      await dispatcher.runOnce();
      expect(bodies).toHaveLength(2);
      expect(
        (
          await fixture.scratch.pool.query<{ suppressed: boolean }>(
            'SELECT suppressed_at IS NOT NULL AS suppressed FROM message_deliveries WHERE occurrence_id=$1',
            [revokedBeforeHandoff.occurrenceId],
          )
        ).rows[0],
      ).toEqual({ suppressed: true });

      const raced = await occurrence(fixture, false, 'email', waveId);
      await expect(
        enqueueOccurrenceMessages(
          {
            pool: fixture.scratch.maintenance,
            encryptionKeys: fixture.keys,
            linkSnapshot: held.snapshot,
          },
          raced.occurrenceId,
          [
            {
              channel: 'email',
              templateId: raced.templateId,
              kind: 'prompt',
              subject: 'Race',
              body: `Never ${held.secret.toString('utf8')}`,
            },
          ],
        ),
      ).resolves.toBe(false);
      held.secret.fill(0);
      await Promise.all([
        issueParticipantInterviewLink(fixture.keys, fixture.context, {
          ...fixture.target,
          waveId,
        }),
        issueParticipantInterviewLink(fixture.keys, fixture.context, {
          ...fixture.target,
          waveId,
        }),
      ]);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT count(*)::int AS n FROM interview_links WHERE wave_id=$1 AND participant_id=$2 AND revoked_at IS NULL',
            [waveId, fixture.target.participantId],
          )
        ).rows[0],
      ).toEqual({ n: 1 });
      expect(
        JSON.stringify(
          (
            await fixture.scratch.pool.query(
              "SELECT event_type,details FROM audit_events WHERE event_type IN ('interview.link.issued','message.link.read')",
            )
          ).rows,
        ),
      ).not.toContain(encodedSecret);
    });
  });

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

  it('quarantines a missing-template occurrence so another tenant can progress, and sweeps expiry', async () => {
    await participantFixture(async (fixture) => {
      await fixture.scratch.pool.query(
        "UPDATE studies SET state='live',went_live_at=statement_timestamp() WHERE id=$1",
        [fixture.target.studyId],
      );
      await fixture.scratch.pool.query(
        'UPDATE participants SET enrolled_at=statement_timestamp() WHERE id=$1',
        [fixture.target.participantId],
      );
      const waveId = randomUUID();
      await fixture.scratch.pool.query(
        `INSERT INTO study_waves(id,study_id,team_id,wave_number) VALUES($1,$2,$3,1)`,
        [waveId, fixture.target.studyId, fixture.context.tenantDb.teamId],
      );
      await issueParticipantInterviewLink(fixture.keys, fixture.context, {
        ...fixture.target,
        waveId,
      });
      const blocked = await occurrence(fixture, false, 'sms', waveId);
      await fixture.scratch.pool.query(
        'DELETE FROM message_templates WHERE id=$1',
        [blocked.templateId],
      );
      const eligible = await occurrence(fixture, false, 'email', waveId);

      await expect(
        produceDueOccurrenceMessage({
          pool: fixture.scratch.maintenance,
          encryptionKeys: fixture.keys,
          publicBaseUrl: 'https://studio.example',
        }),
      ).resolves.toBe(false);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT state FROM schedule_occurrences WHERE id=$1',
            [blocked.occurrenceId],
          )
        ).rows[0],
      ).toEqual({ state: 'blocked' });
      await expect(
        produceDueOccurrenceMessage({
          pool: fixture.scratch.maintenance,
          encryptionKeys: fixture.keys,
          publicBaseUrl: 'https://studio.example',
        }),
      ).resolves.toBe(true);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT count(*)::int AS n FROM message_deliveries WHERE occurrence_id=$1',
            [eligible.occurrenceId],
          )
        ).rows[0],
      ).toEqual({ n: 1 });

      const expired = await occurrence(fixture, true, 'email', waveId);
      await expect(
        expireScheduledOccurrences(fixture.scratch.maintenance),
      ).resolves.toBe(1);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT state FROM schedule_occurrences WHERE id=$1',
            [expired.occurrenceId],
          )
        ).rows[0],
      ).toEqual({ state: 'expired' });
      expect(
        (
          await fixture.scratch.pool.query(
            "SELECT event_type FROM audit_events WHERE resource_id IN ($1,$2) AND event_type IN ('message.occurrence.blocked','message.occurrence.expired') ORDER BY event_type",
            [blocked.occurrenceId, expired.occurrenceId],
          )
        ).rows,
      ).toEqual([
        { event_type: 'message.occurrence.blocked' },
        { event_type: 'message.occurrence.expired' },
      ]);
    });
  });

  it.each(['pause', 'revoke'] as const)(
    'waits for an uncommitted %s and rechecks it before provider handoff',
    async (mutation) => {
      await participantFixture(async (fixture) => {
        await fixture.scratch.pool.query(
          "UPDATE studies SET state='live',went_live_at=statement_timestamp() WHERE id=$1",
          [fixture.target.studyId],
        );
        await fixture.scratch.pool.query(
          'UPDATE participants SET enrolled_at=statement_timestamp() WHERE id=$1',
          [fixture.target.participantId],
        );
        const waveId = randomUUID();
        await fixture.scratch.pool.query(
          `INSERT INTO study_waves(id,study_id,team_id,wave_number) VALUES($1,$2,$3,1)`,
          [waveId, fixture.target.studyId, fixture.context.tenantDb.teamId],
        );
        const issued = await issueParticipantInterviewLink(
          fixture.keys,
          fixture.context,
          { ...fixture.target, waveId },
        );
        const due = await occurrence(fixture, false, 'email', waveId);
        await produceDueOccurrenceMessage({
          pool: fixture.scratch.maintenance,
          encryptionKeys: fixture.keys,
          publicBaseUrl: 'https://studio.example',
        });
        await fixture.scratch.pool.query(
          'UPDATE message_deliveries SET available_at=clock_timestamp()',
        );
        const writer = await fixture.scratch.pool.connect();
        await writer.query('BEGIN');
        if (mutation === 'pause') {
          await writer.query(
            `UPDATE study_schedules SET state='paused'
             WHERE id=(SELECT schedule_id FROM schedule_occurrences WHERE id=$1)`,
            [due.occurrenceId],
          );
        } else {
          await writer.query(
            'UPDATE interview_links SET revoked_at=clock_timestamp() WHERE id=$1',
            [issued.linkId],
          );
        }
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
                return { status: 'accepted' as const, messageId: 'sent' };
              },
              close() {},
            },
          },
        });
        const run = dispatcher.runOnce();
        try {
          await waitForAudit(fixture, 'message.contact.read');
          await writer.query('COMMIT');
          await expect(run).resolves.toMatchObject({ suppressed: 1 });
          expect(sends).toBe(0);
        } finally {
          await writer.query('ROLLBACK').catch(() => undefined);
          writer.release();
          await run.catch(() => undefined);
        }
      });
    },
  );

  it('rechecks withdrawal after enqueue and before provider handoff', async () => {
    await participantFixture(async (fixture) => {
      const due = await occurrence(fixture);
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        due.occurrenceId,
        [
          {
            channel: 'email',
            templateId: due.templateId,
            kind: 'prompt',
            subject: 'Withdrawn',
            body: 'Never sent',
          },
        ],
      );
      await fixture.scratch.pool.query(
        `INSERT INTO consent_documents(id,study_id,team_id,version,state,title,body,content_hash,published_at)
         VALUES($1,$2,$3,1,'published','Consent','{}'::jsonb,$4,clock_timestamp())`,
        [
          randomUUID(),
          fixture.target.studyId,
          fixture.context.tenantDb.teamId,
          createHash('sha256').update('Body').digest('hex'),
        ],
      );
      const document = await fixture.scratch.pool.query<{ id: string }>(
        'SELECT id FROM consent_documents WHERE study_id=$1',
        [fixture.target.studyId],
      );
      const withdrawal = await fixture.scratch.pool.connect();
      await withdrawal.query('BEGIN');
      await withdrawal.query(
        `INSERT INTO participant_consents
          (id,participant_id,consent_document_id,study_id,team_id,method,granted_at,consent_content_hash,withdrawn_at,withdrawn_by)
         VALUES($1,$2,$3,$4,$5,'affirmation',clock_timestamp()-interval '1 minute',$6,clock_timestamp(),'participant')`,
        [
          randomUUID(),
          fixture.target.participantId,
          document.rows[0]!.id,
          fixture.target.studyId,
          fixture.context.tenantDb.teamId,
          createHash('sha256').update('Body').digest('hex'),
        ],
      );
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp()',
      );
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
              return { status: 'accepted' as const, messageId: 'sent' };
            },
            close() {},
          },
        },
      });
      try {
        await expect(dispatcher.runOnce()).resolves.toMatchObject({
          claimed: 0,
        });
        await withdrawal.query('COMMIT');
        await expect(dispatcher.runOnce()).resolves.toMatchObject({
          suppressed: 1,
        });
        expect(sends).toBe(0);
      } finally {
        await withdrawal.query('ROLLBACK').catch(() => undefined);
        withdrawal.release();
      }
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

  it('rechecks the database lease clock after waiting on authority locks', async () => {
    await participantFixture(async (fixture) => {
      const due = await occurrence(fixture);
      await enqueueOccurrenceMessages(
        { pool: fixture.scratch.maintenance, encryptionKeys: fixture.keys },
        due.occurrenceId,
        [
          {
            channel: 'email',
            templateId: due.templateId,
            kind: 'prompt',
            subject: 'Lease boundary',
            body: 'Never handed off',
          },
        ],
      );
      await fixture.scratch.pool.query(
        'UPDATE message_deliveries SET available_at=clock_timestamp()',
      );
      const writer = await fixture.scratch.pool.connect();
      await writer.query('BEGIN');
      await writer.query(
        `SELECT 1 FROM study_schedules
         WHERE id=(SELECT schedule_id FROM schedule_occurrences WHERE id=$1)
         FOR UPDATE`,
        [due.occurrenceId],
      );
      let sends = 0;
      const adapter = new MessageDeliveryAdapter({
        pool: fixture.scratch.maintenance,
        encryptionKeys: fixture.keys,
        email: {
          provider: 'smtp',
          from: 'studio@example.org',
          sender: {
            async send() {
              sends += 1;
              return { status: 'accepted' as const, messageId: 'sent' };
            },
            close() {},
          },
        },
      });
      const owner = randomUUID();
      const claim = await adapter.claim({ owner, durationMs: 250 }, 3);
      if (!claim) throw new Error('expected delivery claim');
      const delivery = adapter.deliver(claim);
      try {
        await waitForAudit(fixture, 'message.contact.read');
        await fixture.scratch.pool.query('SELECT pg_sleep(0.3)');
        await writer.query('COMMIT');
        await expect(delivery).resolves.toBe('lease-lost');
        expect(sends).toBe(0);
      } finally {
        await writer.query('ROLLBACK').catch(() => undefined);
        writer.release();
        await delivery.catch(() => undefined);
      }
    });
  });
});
