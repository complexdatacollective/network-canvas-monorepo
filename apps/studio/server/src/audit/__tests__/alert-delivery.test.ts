import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailDeliveryError } from '@codaco/studio-sync/email-sender';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import type { AuditAlertMailer } from '../../auth/email.ts';
import {
  AuditAlertDeliveryDispatcher,
  AuditAlertDeliveryRoleError,
} from '../alert-delivery-dispatcher.ts';
import {
  listInAppAuditAlerts,
  markInAppAuditAlertRead,
} from '../alert-store.ts';
import {
  loadAuditAlertPreferences,
  saveAuditAlertPreferences,
} from '../alert-preferences.ts';
import type { AuditEventInput } from '../events.ts';
import { AuditStore } from '../store.ts';

const db = await reachableDb();
const TEAM = 'audit-alert-team';
const OWNER = 'audit-alert-owner';
const ADMIN = 'audit-alert-admin';
const MEMBER = 'audit-alert-member';
const store = new AuditStore();

type Scratch = Awaited<ReturnType<typeof createScratchSchema>>;

function alertEvent(): AuditEventInput {
  const now = new Date().toISOString();
  return {
    teamId: TEAM,
    teamLabel: 'Audit alert team',
    eventType: 'security.denied_attempts.rate_limited',
    eventVersion: 1,
    category: 'security',
    outcome: 'denied',
    actorKind: 'user',
    actorId: MEMBER,
    actorLabel: 'Researcher',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
    requestId: randomUUID(),
    details: {
      operation: 'participants.pii.read',
      suppressedCount: 3,
      firstSuppressedAt: now,
      lastSuppressedAt: now,
    },
  };
}

async function appendAlert(scratch: Scratch) {
  const tenant = createTenantDb(scratch.app, TEAM);
  return tenant.transaction((client) => store.append(client, alertEvent()));
}

async function seed(scratch: Scratch) {
  await scratch.pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES
       ($1, 'Owner', 'owner@example.test', true),
       ($2, 'Admin', 'admin@example.test', true),
       ($3, 'Member', 'member@example.test', true),
       ('unverified', 'Unverified', 'unverified@example.test', false)`,
    [OWNER, ADMIN, MEMBER],
  );
  await scratch.pool.query(
    `INSERT INTO teams (id, name, slug) VALUES ($1, 'Audit alert team', $1)`,
    [TEAM],
  );
  await scratch.pool.query(
    `INSERT INTO team_members (id, team_id, user_id, role) VALUES
       (gen_random_uuid(), $4, $1, 'owner'),
       (gen_random_uuid(), $4, $2, 'admin'),
       (gen_random_uuid(), $4, $3, 'member'),
       (gen_random_uuid(), $4, 'unverified', 'admin')`,
    [OWNER, ADMIN, MEMBER, TEAM],
  );
}

function dispatcher(pool: Pool, mailer: AuditAlertMailer) {
  return new AuditAlertDeliveryDispatcher({
    pool,
    mailer,
    retryBaseMs: 0,
    retryMaxMs: 0,
  });
}

describe.skipIf(!db)('researcher audit-alert delivery', () => {
  let scratch: Scratch;

  beforeEach(async () => {
    if (!db) throw new Error('unreachable');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    await seed(scratch);
  });

  afterEach(async () => {
    await scratch?.dispose();
  });

  it('commits one alert with durable email and in-app records for verified privileged members', async () => {
    const event = await appendAlert(scratch);
    const rows = await scratch.pool.query<{
      channel: string;
      recipient_user_id: string;
      delivered: boolean;
    }>(
      `SELECT delivery.channel, delivery.recipient_user_id,
              delivery.delivered_at IS NOT NULL AS delivered
       FROM audit_alert_deliveries delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       WHERE alert.audit_event_id = $1
       ORDER BY delivery.recipient_user_id, delivery.channel`,
      [event.id],
    );
    expect(rows.rows).toEqual([
      { channel: 'email', recipient_user_id: ADMIN, delivered: false },
      { channel: 'in_app', recipient_user_id: ADMIN, delivered: true },
      { channel: 'email', recipient_user_id: OWNER, delivered: false },
      { channel: 'in_app', recipient_user_id: OWNER, delivered: true },
    ]);
  });

  it('rejects a non-privileged or disabled preference recipient and enforces saved channels', async () => {
    const client = await scratch.pool.connect();
    try {
      await expect(
        saveAuditAlertPreferences(
          client,
          { teamId: TEAM, recipients: [{ userId: MEMBER, emailEnabled: true, inAppEnabled: true }] },
          OWNER,
        ),
      ).rejects.toThrow('recipient is not deliverable');
      await scratch.pool.query('UPDATE "user" SET recovery_disabled = true WHERE id = $1', [ADMIN]);
      await expect(
        saveAuditAlertPreferences(
          client,
          { teamId: TEAM, recipients: [{ userId: ADMIN, emailEnabled: true, inAppEnabled: true }] },
          OWNER,
        ),
      ).rejects.toThrow('recipient is not deliverable');
      await scratch.pool.query('UPDATE "user" SET recovery_disabled = false WHERE id = $1', [ADMIN]);
      await client.query('BEGIN');
      const preferences = await saveAuditAlertPreferences(
        client,
        { teamId: TEAM, recipients: [{ userId: OWNER, emailEnabled: false, inAppEnabled: true }, { userId: ADMIN, emailEnabled: true, inAppEnabled: false }] },
        OWNER,
      );
      await client.query('COMMIT');
      expect(preferences.configured).toBe(true);
      const event = await appendAlert(scratch);
      const rows = await scratch.pool.query(
        `SELECT recipient_user_id, channel FROM audit_alert_deliveries delivery
         JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
         WHERE alert.audit_event_id = $1 ORDER BY recipient_user_id, channel`,
        [event.id],
      );
      expect(rows.rows).toEqual([
        { recipient_user_id: ADMIN, channel: 'email' },
        { recipient_user_id: OWNER, channel: 'in_app' },
      ]);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('does not address a recovery-disabled privileged account', async () => {
    await scratch.pool.query(
      `UPDATE "user" SET recovery_disabled = true WHERE id = $1`,
      [ADMIN],
    );
    const event = await appendAlert(scratch);
    const rows = await scratch.pool.query<{ recipient_user_id: string }>(
      `SELECT delivery.recipient_user_id
       FROM audit_alert_deliveries delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       WHERE alert.audit_event_id = $1
       ORDER BY delivery.channel`,
      [event.id],
    );
    expect(rows.rows).toEqual([
      { recipient_user_id: OWNER },
      { recipient_user_id: OWNER },
    ]);
  });

  it('rolls back the event, outbox and recipient records together', async () => {
    const tenant = createTenantDb(scratch.app, TEAM);
    const requestId = randomUUID();
    await expect(
      tenant.transaction(async (client) => {
        await store.append(client, { ...alertEvent(), requestId });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    const rows = await scratch.pool.query(
      `SELECT 1 FROM audit_events WHERE request_id = $1`,
      [requestId],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('rate-limits the same policy under the existing team transaction lock', async () => {
    await scratch.pool.query(
      `UPDATE audit_alert_outbox SET created_at = now() - interval '1 hour'`,
    );
    const first = await appendAlert(scratch);
    const second = await appendAlert(scratch);
    const rows = await scratch.pool.query<{ id: string; suppressed: boolean }>(
      `SELECT audit_event_id AS id, suppressed_at IS NOT NULL AS suppressed
       FROM audit_alert_outbox WHERE audit_event_id = ANY($1::uuid[])
       ORDER BY audit_event_sequence`,
      [[first.id, second.id]],
    );
    expect(rows.rows).toEqual([
      { id: first.id, suppressed: false },
      { id: second.id, suppressed: true },
    ]);
    const secondDeliveries = await scratch.pool.query(
      `SELECT 1 FROM audit_alert_deliveries delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       WHERE alert.audit_event_id = $1`,
      [second.id],
    );
    expect(secondDeliveries.rowCount).toBe(0);
  });

  it('lists only the addressed in-app records and retains an idempotent read marker', async () => {
    await scratch.pool.query(
      `UPDATE audit_alert_outbox SET created_at = now() - interval '1 hour'`,
    );
    await appendAlert(scratch);
    const tenant = createTenantDb(scratch.app, TEAM);
    const ownerAlerts = await tenant.transaction((client) =>
      listInAppAuditAlerts(client, { teamId: TEAM, userId: OWNER }),
    );
    expect(ownerAlerts.length).toBeGreaterThan(0);
    const target = ownerAlerts[0]!;
    await expect(
      tenant.transaction((client) =>
        markInAppAuditAlertRead(client, {
          id: target.id,
          teamId: TEAM,
          userId: MEMBER,
        }),
      ),
    ).resolves.toBe(false);
    await expect(
      tenant.transaction((client) =>
        markInAppAuditAlertRead(client, {
          id: target.id,
          teamId: TEAM,
          userId: OWNER,
        }),
      ),
    ).resolves.toBe(true);
    const reread = await tenant.transaction((client) =>
      listInAppAuditAlerts(client, { teamId: TEAM, userId: OWNER }),
    );
    expect(reread.find(({ id }) => id === target.id)?.readAt).toBeInstanceOf(
      Date,
    );
    await expect(
      tenant.transaction((client) =>
        client.query(
          `UPDATE audit_alert_deliveries SET read_at = NULL WHERE id = $1`,
          [target.id],
        ),
      ),
    ).rejects.toThrow('audit alert delivery payload is immutable');
  });

  it('delivers every email once with a stable provider id and no event details', async () => {
    await scratch.pool.query(
      `UPDATE audit_alert_outbox SET created_at = now() - interval '1 hour'`,
    );
    const event = await appendAlert(scratch);
    const sendAuditAlert = vi
      .fn<AuditAlertMailer['sendAuditAlert']>()
      .mockResolvedValue(undefined);
    const delivery = dispatcher(scratch.maintenance, { sendAuditAlert });
    await expect(delivery.runOnce()).resolves.toMatchObject({ completed: 1 });
    await expect(delivery.runOnce()).resolves.toMatchObject({ completed: 1 });
    await expect(delivery.runOnce()).resolves.toMatchObject({ claimed: 0 });
    expect(sendAuditAlert).toHaveBeenCalledTimes(2);
    const calls = sendAuditAlert.mock.calls.map(([message]) => message);
    expect(new Set(calls.map(({ messageId }) => messageId)).size).toBe(2);
    expect(JSON.stringify(calls)).not.toContain('suppressedCount');
    expect(JSON.stringify(calls)).not.toContain(MEMBER);
    const parent = await scratch.pool.query(
      `SELECT delivered_at IS NOT NULL AS delivered, failed_at, uncertain_at
       FROM audit_alert_outbox WHERE audit_event_id = $1`,
      [event.id],
    );
    expect(parent.rows).toEqual([
      { delivered: true, failed_at: null, uncertain_at: null },
    ]);
  });

  it('retries a confirmed failure without resending an accepted recipient', async () => {
    await scratch.pool.query(
      `UPDATE audit_alert_outbox SET created_at = now() - interval '1 hour'`,
    );
    await appendAlert(scratch);
    const attempts = new Map<string, number>();
    const sendAuditAlert = vi.fn<AuditAlertMailer['sendAuditAlert']>(
      async ({ email }) => {
        const count = (attempts.get(email) ?? 0) + 1;
        attempts.set(email, count);
        if (email === 'admin@example.test' && count === 1)
          throw new EmailDeliveryError('retryable');
      },
    );
    const delivery = dispatcher(scratch.maintenance, { sendAuditAlert });
    for (let index = 0; index < 4; index += 1) await delivery.runOnce();
    expect(attempts.get('admin@example.test')).toBe(2);
    expect(attempts.get('owner@example.test')).toBe(1);
  });

  it('makes an ambiguous provider result terminal without suppressing another recipient', async () => {
    await scratch.pool.query(
      `UPDATE audit_alert_outbox SET created_at = now() - interval '1 hour'`,
    );
    const event = await appendAlert(scratch);
    const attempted: string[] = [];
    const sendAuditAlert = vi.fn<AuditAlertMailer['sendAuditAlert']>(
      async ({ email }) => {
        attempted.push(email);
        if (email === 'admin@example.test')
          throw new EmailDeliveryError('uncertain');
      },
    );
    const delivery = dispatcher(scratch.maintenance, { sendAuditAlert });
    await delivery.runOnce();
    await delivery.runOnce();
    await delivery.runOnce();
    expect(attempted.toSorted()).toEqual([
      'admin@example.test',
      'owner@example.test',
    ]);
    const parent = await scratch.pool.query(
      `SELECT uncertain_at, delivered_at, failed_at
       FROM audit_alert_outbox WHERE audit_event_id = $1`,
      [event.id],
    );
    expect(parent.rows[0]).toMatchObject({
      uncertain_at: expect.any(Date),
      delivered_at: null,
      failed_at: null,
    });
  });

  it('suppresses email after recipient privilege is removed but retains in-app evidence', async () => {
    await scratch.pool.query(
      `UPDATE audit_alert_outbox SET created_at = now() - interval '1 hour'`,
    );
    const event = await appendAlert(scratch);
    await scratch.pool.query(
      `UPDATE team_members SET role = 'member'
       WHERE team_id = $1 AND user_id = $2`,
      [TEAM, ADMIN],
    );
    const sendAuditAlert = vi
      .fn<AuditAlertMailer['sendAuditAlert']>()
      .mockResolvedValue(undefined);
    const delivery = dispatcher(scratch.maintenance, { sendAuditAlert });
    await delivery.runOnce();
    await delivery.runOnce();
    expect(sendAuditAlert.mock.calls.map(([message]) => message.email)).toEqual(
      ['owner@example.test'],
    );
    const retained = await scratch.pool.query(
      `SELECT count(*)::int AS count
       FROM audit_alert_deliveries delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       WHERE alert.audit_event_id = $1
         AND delivery.recipient_user_id = $2
         AND delivery.channel = 'in_app'`,
      [event.id, ADMIN],
    );
    expect(retained.rows).toEqual([{ count: 1 }]);
    const tenant = createTenantDb(scratch.app, TEAM);
    await expect(
      tenant.transaction((client) =>
        listInAppAuditAlerts(client, { teamId: TEAM, userId: ADMIN }),
      ),
    ).resolves.toEqual([]);
    const retainedId = await scratch.pool.query<{ id: string }>(
      `SELECT delivery.id
       FROM audit_alert_deliveries delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       WHERE alert.audit_event_id = $1
         AND delivery.recipient_user_id = $2
         AND delivery.channel = 'in_app'`,
      [event.id, ADMIN],
    );
    await expect(
      tenant.transaction((client) =>
        markInAppAuditAlertRead(client, {
          id: retainedId.rows[0]!.id,
          teamId: TEAM,
          userId: ADMIN,
        }),
      ),
    ).resolves.toBe(false);
    await scratch.pool.query(
      `UPDATE team_members SET role = 'admin'
       WHERE team_id = $1 AND user_id = $2`,
      [TEAM, ADMIN],
    );
  });

  it('suppresses email when recovery disables a recipient after enqueue', async () => {
    const event = await appendAlert(scratch);
    await scratch.pool.query(
      `UPDATE "user" SET recovery_disabled = true WHERE id = $1`,
      [ADMIN],
    );
    const sendAuditAlert = vi
      .fn<AuditAlertMailer['sendAuditAlert']>()
      .mockResolvedValue(undefined);
    const delivery = dispatcher(scratch.maintenance, { sendAuditAlert });
    await delivery.runOnce();
    await delivery.runOnce();
    expect(sendAuditAlert.mock.calls.map(([message]) => message.email)).toEqual(
      ['owner@example.test'],
    );
    const tenant = createTenantDb(scratch.app, TEAM);
    await expect(
      tenant.transaction((client) =>
        listInAppAuditAlerts(client, { teamId: TEAM, userId: ADMIN }),
      ),
    ).resolves.toEqual([]);
    const retainedId = await scratch.pool.query<{ id: string }>(
      `SELECT delivery.id
       FROM audit_alert_deliveries delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       WHERE alert.audit_event_id = $1
         AND delivery.recipient_user_id = $2
         AND delivery.channel = 'in_app'`,
      [event.id, ADMIN],
    );
    await expect(
      tenant.transaction((client) =>
        markInAppAuditAlertRead(client, {
          id: retainedId.rows[0]!.id,
          teamId: TEAM,
          userId: ADMIN,
        }),
      ),
    ).resolves.toBe(false);
  });

  it('suppresses a claim when its verified address changes before the send check', async () => {
    await scratch.pool.query(
      `UPDATE team_members SET role = 'member'
       WHERE team_id = $1 AND user_id = $2`,
      [TEAM, OWNER],
    );
    await appendAlert(scratch);
    let changed = false;
    const racingPool = {
      connect: scratch.maintenance.connect.bind(scratch.maintenance),
      query: async (text: string, values?: unknown[]) => {
        const result = await scratch.maintenance.query(text, values);
        if (!changed && text.includes('claimed_delivery AS')) {
          changed = true;
          await scratch.pool.query(
            `UPDATE "user" SET email = 'replacement@example.test' WHERE id = $1`,
            [ADMIN],
          );
        }
        return result;
      },
    } as unknown as Pool;
    const sendAuditAlert = vi
      .fn<AuditAlertMailer['sendAuditAlert']>()
      .mockResolvedValue(undefined);
    await expect(
      dispatcher(racingPool, { sendAuditAlert }).runOnce(),
    ).resolves.toMatchObject({ claimed: 1, suppressed: 1 });
    expect(changed).toBe(true);
    expect(sendAuditAlert).not.toHaveBeenCalled();
  });

  it('suppresses the parent when no email recipient remains deliverable', async () => {
    const event = await appendAlert(scratch);
    await scratch.pool.query(
      `UPDATE team_members SET role = 'member'
       WHERE team_id = $1 AND user_id IN ($2, $3)`,
      [TEAM, OWNER, ADMIN],
    );
    const sendAuditAlert = vi
      .fn<AuditAlertMailer['sendAuditAlert']>()
      .mockResolvedValue(undefined);
    const delivery = dispatcher(scratch.maintenance, { sendAuditAlert });
    await expect(delivery.runOnce()).resolves.toMatchObject({ suppressed: 2 });
    expect(sendAuditAlert).not.toHaveBeenCalled();
    const parent = await scratch.pool.query(
      `SELECT suppressed_at, delivered_at, failed_at, uncertain_at
       FROM audit_alert_outbox WHERE audit_event_id = $1`,
      [event.id],
    );
    expect(parent.rows[0]).toMatchObject({
      suppressed_at: expect.any(Date),
      delivered_at: null,
      failed_at: null,
      uncertain_at: null,
    });
  });

  it('refuses an application-role dispatcher before sending', async () => {
    const sendAuditAlert = vi
      .fn<AuditAlertMailer['sendAuditAlert']>()
      .mockResolvedValue(undefined);
    await expect(
      dispatcher(scratch.app, { sendAuditAlert }).runOnce(),
    ).rejects.toBeInstanceOf(AuditAlertDeliveryRoleError);
    expect(sendAuditAlert).not.toHaveBeenCalled();
  });
});
