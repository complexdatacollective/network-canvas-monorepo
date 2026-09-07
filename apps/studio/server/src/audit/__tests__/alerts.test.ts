import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { contract } from '@codaco/studio-rpc';
import { EmailDeliveryError } from '@codaco/studio-sync/email-sender';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import { smtpFixture } from '../../../../../../packages/studio-sync/src/__tests__/smtp-fixture.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createMailer, type AuditAlertMailer } from '../../auth/email.ts';
import { createObservability } from '../../observability/runtime.ts';
import type { OutboxLifecycleEvent } from '../../outbox/instrumentation.ts';
import {
  ALERT_EMAIL_DEPLOYMENT_LIMIT,
  ALERT_EMAIL_TEAM_LIMIT,
  AuditAlertDeliveryAdapter,
  createAuditAlertDispatcher,
  startAuditAlertWorker,
} from '../alert-delivery.ts';
import { alertCandidate } from '../alert-policy.ts';
import {
  acknowledgeAuditAlert,
  listAuditAlerts,
  markAuditAlertRead,
  readAuditAlertSettings,
  updateAuditAlertSettings,
} from '../alerts.ts';
import {
  auditActorEventContext,
  runAuditedCommand,
  type AuditedCommandContext,
} from '../command.ts';
import type { AuditEventInput } from '../events.ts';
import { AuditStore } from '../store.ts';

const db = await reachableDb();
const store = new AuditStore();
const teamId = 'audit-alert-team';
const privateLabel = 'participant-protocol-secret-canary';
const userId = 'audit-alert-owner';
const memberId = 'audit-alert-owner-member';

async function fixture() {
  if (!db) throw new Error('A local PostgreSQL fixture is required.');
  const scratch = await createScratchSchema(db);
  await provisionScratchSchema(scratch.pool);
  await scratch.pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES
    ($1, $2, 'researcher@example.test', true, now(), now()),
    ('audit-alert-admin', 'Second researcher', 'second@example.test', true, now(), now())`,
    [userId, privateLabel],
  );
  await scratch.pool
    .query(`INSERT INTO teams (id, name, slug) VALUES ('audit-alert-team', 'participant-protocol-secret-canary', 'audit-alert-team');
    INSERT INTO team_members (id, team_id, user_id, role) VALUES
      ('audit-alert-owner-member', 'audit-alert-team', 'audit-alert-owner', 'owner'),
      ('audit-alert-admin-member', 'audit-alert-team', 'audit-alert-admin', 'admin')`);
  const context: AuditedCommandContext = {
    tenantDb: createTenantDb(scratch.app, teamId),
    principal: {
      kind: 'user',
      userId,
      email: 'researcher@example.test',
      emailVerified: true,
      name: privateLabel,
      locale: null,
      sessionId: 'synthetic-alert-session',
    },
    requestId: randomUUID(),
  };
  const configure = (
    input = [{ memberId, inApp: true, email: true }],
    revision: string | null = null,
  ) => updateAuditAlertSettings(context, { revision, recipients: input }, true);
  const append = (event: AuditEventInput = candidate()) =>
    context.tenantDb.transaction((client) => store.append(client, event));
  const rows = () =>
    scratch.pool.query(
      'SELECT * FROM audit_alert_deliveries ORDER BY created_at, id',
    );
  const dispatcher = (
    mailer?: AuditAlertMailer,
    extra: Partial<Parameters<typeof createAuditAlertDispatcher>[0]> = {},
  ) =>
    createAuditAlertDispatcher({
      pool: scratch.maintenance,
      mailer,
      publicBaseUrl: 'https://studio.example.test',
      retryBaseMs: 0,
      retryMaxMs: 0,
      ...extra,
    });
  return { ...scratch, context, configure, append, rows, dispatcher };
}

function candidate() {
  return {
    teamId,
    teamLabel: privateLabel,
    actorKind: 'user',
    actorId: userId,
    actorLabel: privateLabel,
    requestId: randomUUID(),
    eventType: 'webhook.secret.updated',
    eventVersion: 1,
    category: 'integration',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'webhook_subscription',
    resourceId: randomUUID(),
    resourceLabel: null,
    details: { purpose: 'configuration' },
  } satisfies AuditEventInput;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!db)('audit-alert policy and researcher delivery', () => {
  it('atomically enqueues only configured recipients and never backfills old events', async () => {
    const scratch = await fixture();
    try {
      await scratch.append();
      expect((await scratch.rows()).rowCount).toBe(0);
      expect(
        (
          await scratch.pool.query(
            'SELECT suppressed_at IS NOT NULL AS suppressed FROM audit_alert_outbox',
          )
        ).rows,
      ).toEqual([{ suppressed: true }]);
      await scratch.configure();
      expect((await scratch.rows()).rowCount).toBe(0);
      await scratch.append();
      expect(
        (await scratch.rows()).rows
          .map((row) => row.channel)
          .toSorted((left, right) => left.localeCompare(right)),
      ).toEqual(['email', 'in_app']);
      const eventsBefore = (
        await scratch.pool.query(
          'SELECT count(*)::int AS count FROM audit_events',
        )
      ).rows[0].count;
      const alertsBefore = (await scratch.rows()).rowCount;
      await expect(
        scratch.context.tenantDb.transaction(async (client) => {
          await store.append(client, candidate());
          throw new Error('roll back originating action');
        }),
      ).rejects.toThrow('roll back originating action');
      expect((await scratch.rows()).rowCount).toBe(alertsBefore);
      expect(
        (
          await scratch.pool.query(
            'SELECT count(*)::int AS count FROM audit_events',
          )
        ).rows[0].count,
      ).toBe(eventsBefore);
      await scratch.pool.query(
        'REVOKE INSERT ON audit_alert_deliveries FROM studio_app',
      );
      await expect(
        runAuditedCommand(scratch.context, async (client, auditContext) => {
          await client.query(
            "UPDATE teams SET name = 'changed' WHERE id = $1",
            [teamId],
          );
          return {
            status: 'succeeded',
            result: undefined,
            events: [
              { ...candidate(), ...auditActorEventContext(auditContext) },
            ],
          };
        }),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (
          await scratch.pool.query('SELECT name FROM teams WHERE id = $1', [
            teamId,
          ])
        ).rows[0],
      ).toEqual({ name: privateLabel });
      expect(
        (
          await scratch.pool.query(
            'SELECT count(*)::int AS count FROM audit_events',
          )
        ).rows[0].count,
      ).toBe(eventsBefore);
    } finally {
      await scratch.dispose();
    }
  });

  it('uses a closed event policy and a bounded five-denial threshold with cooldown', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure();
      const event = candidate();
      expect(
        alertCandidate({
          ...event,
          eventType: 'webhook.secret.read',
          details: { purpose: 'delivery' },
        }),
      ).toBeNull();
      expect(
        alertCandidate({
          ...event,
          eventType: 'webhook.secret.rotated',
          details: { purpose: 'rotation' },
        }),
      ).toBeNull();
      const denied: AuditEventInput = {
        ...event,
        eventType: 'participant.pii.denied',
        category: 'participant_data',
        outcome: 'denied',
        resourceType: null,
        resourceId: null,
        resourceLabel: null,
        details: { operation: 'read', reason: 'insufficient_permission' },
      };
      for (let count = 0; count < 4; count++) await scratch.append(denied);
      expect((await scratch.rows()).rowCount).toBe(0);
      await scratch.append(denied);
      expect((await scratch.rows()).rowCount).toBe(2);
      await scratch.append(denied);
      expect((await scratch.rows()).rowCount).toBe(2);
      expect(
        (
          await scratch.pool.query(
            'SELECT alert_policy_key FROM audit_alert_outbox',
          )
        ).rows,
      ).toEqual([{ alert_policy_key: 'repeated_denials' }]);
    } finally {
      await scratch.dispose();
    }
  });

  it('persists settings changes, rejects stale revisions and retains unchanged preference identities', async () => {
    const scratch = await fixture();
    try {
      const first = await scratch.configure();
      const identity = (
        await scratch.pool.query('SELECT id FROM audit_alert_recipients')
      ).rows[0];
      expect(await scratch.configure(undefined, first.revision)).toEqual(first);
      expect(
        (await scratch.pool.query('SELECT id FROM audit_alert_recipients'))
          .rows[0],
      ).toEqual(identity);
      await expect(scratch.configure([], null)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      await expect(
        scratch.configure(
          [{ memberId: 'not-a-member', inApp: true, email: false }],
          first.revision,
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(
        (
          await scratch.pool.query(
            "SELECT count(*)::int AS count FROM audit_events WHERE event_type = 'audit.alert_settings.updated'",
          )
        ).rows[0],
      ).toEqual({ count: 1 });
      expect(await readAuditAlertSettings(scratch.context, true)).toMatchObject(
        {
          revision: first.revision,
          recipients: [{ memberId, inApp: true, email: true }],
          emailAvailable: true,
        },
      );
      await scratch.pool.query(
        "UPDATE team_members SET role = 'member' WHERE id = $1",
        [memberId],
      );
      await expect(scratch.configure([], first.revision)).rejects.toMatchObject(
        { code: 'FORBIDDEN' },
      );
    } finally {
      await scratch.dispose();
    }
  });

  it('rolls back preference and uncertainty acknowledgement changes when their mandatory audit write fails', async () => {
    const scratch = await fixture();
    try {
      const configured = await scratch.configure();
      await scratch.append();
      const send = vi
        .fn<AuditAlertMailer['sendAuditAlert']>()
        .mockRejectedValue(new EmailDeliveryError('uncertain'));
      for (let pass = 0; pass < 3; pass++)
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce();
      const emailId = (await scratch.rows()).rows.find(
        (row) => row.channel === 'email',
      )!.id as string;
      await scratch.pool.query('REVOKE INSERT ON audit_events FROM studio_app');
      await expect(
        scratch.configure(
          [{ memberId, inApp: false, email: true }],
          configured.revision,
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        acknowledgeAuditAlert(scratch.context, emailId),
      ).rejects.toMatchObject({ code: '42501' });
      expect(await readAuditAlertSettings(scratch.context, true)).toMatchObject(
        {
          revision: configured.revision,
          recipients: [{ memberId, inApp: true, email: true }],
        },
      );
      expect(
        (await scratch.rows()).rows.find((row) => row.id === emailId)!
          .acknowledged_at,
      ).toBeNull();
      await scratch.pool.query('GRANT INSERT ON audit_events TO studio_app');
      await acknowledgeAuditAlert(scratch.context, emailId);
      expect(
        (await scratch.rows()).rows.find((row) => row.id === emailId)!
          .acknowledged_at,
      ).toBeInstanceOf(Date);
      expect(
        (
          await scratch.pool.query(
            "SELECT event_type FROM audit_events WHERE event_type IN ('audit.alert_delivery.acknowledged', 'audit.alert_settings.updated') ORDER BY event_type",
          )
        ).rows,
      ).toEqual([
        { event_type: 'audit.alert_delivery.acknowledged' },
        { event_type: 'audit.alert_settings.updated' },
      ]);
    } finally {
      await scratch.dispose();
    }
  });

  it('scopes feed and read or uncertainty acknowledgements to the exact current user and team', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure();
      await scratch.append();
      const send = vi
        .fn<AuditAlertMailer['sendAuditAlert']>()
        .mockRejectedValue(new EmailDeliveryError('uncertain'));
      for (let pass = 0; pass < 3; pass++)
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce();
      const [item] = (await listAuditAlerts(scratch.context)).items;
      expect(item).toMatchObject({ inApp: true, emailState: 'uncertain' });
      if (!item?.emailDeliveryId) throw new Error('Expected personal delivery');
      const otherUser = {
        ...scratch.context,
        principal: {
          ...scratch.context.principal,
          userId: 'audit-alert-admin',
          email: 'second@example.test',
        },
      };
      const otherTeamId = 'other-alert-team';
      await scratch.pool.query(
        'INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)',
        [otherTeamId],
      );
      await scratch.pool.query(
        "INSERT INTO team_members (id, team_id, user_id, role) VALUES ('other-alert-owner', $1, $2, 'owner')",
        [otherTeamId, userId],
      );
      const otherTeam = {
        ...scratch.context,
        tenantDb: createTenantDb(scratch.app, otherTeamId),
      };
      for (const context of [otherUser, otherTeam]) {
        expect((await listAuditAlerts(context)).items).toEqual([]);
        await expect(
          markAuditAlertRead(context, item.id),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
          acknowledgeAuditAlert(context, item.emailDeliveryId),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      }
      expect((await listAuditAlerts(scratch.context)).items[0]).toMatchObject({
        readAt: null,
        emailAcknowledgedAt: null,
      });
      await markAuditAlertRead(scratch.context, item.id);
      await acknowledgeAuditAlert(scratch.context, item.emailDeliveryId);
      const owned = await listAuditAlerts(scratch.context);
      expect(owned.items[0]).toMatchObject({
        readAt: expect.any(Date),
        emailAcknowledgedAt: expect.any(Date),
      });
      expect(JSON.stringify(owned)).not.toContain(privateLabel);
      expect(JSON.stringify(owned)).not.toContain('researcher@example.test');
    } finally {
      await scratch.dispose();
    }
  });

  it('rejects invalid sequence cursors at the actual RPC boundary and pages by exact bigint sequence', async () => {
    const [inputSchema] =
      contract.audit.alerts.list['~orpc'].inputSchemas ?? [];
    if (!inputSchema) throw new Error('Missing alert list wire schema');
    for (const cursor of [
      '0',
      '-1',
      '1.5',
      'NaN',
      '9223372036854775808',
      '0'.repeat(1000),
    ]) {
      const result = await inputSchema['~standard'].validate({
        teamId,
        cursor,
      });
      expect(result.issues?.length).toBeGreaterThan(0);
    }
    expect(
      (
        await inputSchema['~standard'].validate({
          teamId,
          cursor: '9223372036854775807',
        })
      ).issues,
    ).toBeUndefined();
    const scratch = await fixture();
    try {
      await scratch.configure([{ memberId, inApp: false, email: true }]);
      await scratch.context.tenantDb.transaction(async (client) => {
        for (let index = 0; index < 51; index++)
          await store.append(client, candidate());
      });
      const first = await listAuditAlerts(scratch.context);
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).toBe(first.items.at(-1)!.sequence);
      const second = await listAuditAlerts(scratch.context, first.nextCursor!);
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
      ).toBe(51);
      expect(BigInt(second.items[0]!.sequence)).toBeLessThan(
        BigInt(first.nextCursor!),
      );
    } finally {
      await scratch.dispose();
    }
  });

  it('holds verified membership stable through SMTP handoff before a committed revocation suppresses later work', async () => {
    const scratch = await fixture();
    const peer = await smtpFixture('silent_data');
    const mailer = createMailer({
      kind: 'smtp',
      url: peer.url,
      from: 'sender@example.test',
    });
    const revoker = await scratch.pool.connect();
    let sending: Promise<unknown> | undefined;
    let revoke: Promise<unknown> | undefined;
    try {
      await scratch.configure([{ memberId, inApp: false, email: true }]);
      await scratch.append();
      await scratch.append();
      sending = scratch.dispatcher(mailer).runOnce();
      await Promise.race([
        peer.dataReceived,
        sending.then(() => {
          throw new Error('Dispatch ended before held SMTP DATA');
        }),
      ]);
      const pid = (
        await revoker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing revoker connection');
      revoke = revoker.query(
        'UPDATE "user" SET "emailVerified" = false WHERE id = $1',
        [userId],
      );
      await vi.waitFor(async () => {
        expect(
          (
            await scratch.pool.query(
              'SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked',
              [pid],
            )
          ).rows,
        ).toEqual([{ blocked: true }]);
      });
      peer.acceptPending();
      expect(await sending).toMatchObject({ completed: 1 });
      await revoke;
      expect(await scratch.dispatcher(mailer).runOnce()).toMatchObject({
        suppressed: 1,
        claimed: 0,
      });
      expect(peer.messages).toHaveLength(1);
      expect(
        (await scratch.rows()).rows
          .map((row) => Boolean(row.delivered_at))
          .filter(Boolean),
      ).toHaveLength(1);
    } finally {
      mailer.close();
      await Promise.allSettled([sending, revoke]);
      revoker.release();
      await peer.close();
      await scratch.dispose();
    }
  });

  it('delivers to each recipient/channel once under multiple workers and retains partial success', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure([
        { memberId, inApp: true, email: true },
        { memberId: 'audit-alert-admin-member', inApp: true, email: true },
      ]);
      await scratch.append();
      const send = vi
        .fn<AuditAlertMailer['sendAuditAlert']>()
        .mockImplementation(async ({ email }) => {
          if (email === 'second@example.test')
            throw new EmailDeliveryError('permanent');
        });
      const workers = Array.from({ length: 4 }, () =>
        scratch.dispatcher({ sendAuditAlert: send }),
      );
      for (let pass = 0; pass < 8; pass++)
        await Promise.all(workers.map((worker) => worker.runOnce()));
      const rows = (await scratch.rows()).rows;
      expect(rows).toHaveLength(4);
      expect(rows.filter((row) => row.delivered_at)).toHaveLength(3);
      expect(rows.filter((row) => row.failed_at)).toHaveLength(1);
      expect(send).toHaveBeenCalledTimes(2);
      expect(rows.map((row) => row.attempt_count)).toEqual([1, 1, 1, 1]);
      expect(
        (
          await scratch.pool.query(
            "SELECT count(*)::int AS count FROM audit_events WHERE event_type = 'webhook.secret.updated'",
          )
        ).rows[0],
      ).toEqual({ count: 1 });
      expect(
        (
          await scratch.pool.query(
            'SELECT failed_at IS NOT NULL AS failed FROM audit_alert_outbox',
          )
        ).rows,
      ).toEqual([{ failed: true }]);
    } finally {
      await scratch.dispose();
    }
  });

  it.each(['team', 'deployment'] as const)(
    'persists the %s email admission cap across competing workers and restart',
    async (scope) => {
      const scratch = await fixture();
      try {
        await scratch.configure([{ memberId, inApp: false, email: true }]);
        await scratch.append();
        if (scope === 'team') await scratch.append();
        else {
          const secondTeamId = 'audit-alert-second-team';
          await scratch.pool.query(
            'INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1);',
            [secondTeamId],
          );
          await scratch.pool.query(
            "INSERT INTO team_members (id, team_id, user_id, role) VALUES ('second-team-owner', $1, $2, 'owner')",
            [secondTeamId, userId],
          );
          const context = {
            ...scratch.context,
            tenantDb: createTenantDb(scratch.app, secondTeamId),
          };
          await updateAuditAlertSettings(
            context,
            {
              revision: null,
              recipients: [
                { memberId: 'second-team-owner', inApp: false, email: true },
              ],
            },
            true,
          );
          await context.tenantDb.transaction((client) =>
            store.append(client, { ...candidate(), teamId: secondTeamId }),
          );
        }
        // Seed previously admitted attempts in a conservative future window so
        // a test crossing a wall-clock minute cannot reset the capacity oracle.
        await scratch.pool.query(
          `INSERT INTO audit_alert_dispatch_budget (scope, window_started_at, attempts) VALUES
        ('global', date_trunc('minute', clock_timestamp()) + interval '1 minute', $1),
        ($2, date_trunc('minute', clock_timestamp()) + interval '1 minute', $3)`,
          [
            scope === 'deployment' ? ALERT_EMAIL_DEPLOYMENT_LIMIT - 1 : 0,
            `team:${teamId}`,
            scope === 'team' ? ALERT_EMAIL_TEAM_LIMIT - 1 : 0,
          ],
        );
        const send = vi
          .fn<AuditAlertMailer['sendAuditAlert']>()
          .mockResolvedValue(undefined);
        await Promise.all(
          Array.from({ length: 4 }, () =>
            scratch.dispatcher({ sendAuditAlert: send }).runOnce(),
          ),
        );
        // Every new dispatcher is an independent restarted worker. It may defer
        // the next ready child, but cannot lose the committed admission budget.
        for (let pass = 0; pass < 4; pass++)
          await scratch.dispatcher({ sendAuditAlert: send }).runOnce();
        const rows = (await scratch.rows()).rows;
        expect(rows).toHaveLength(2);
        expect(rows.filter((row) => row.delivered_at)).toHaveLength(1);
        expect(
          rows
            .map((row) => row.attempt_count)
            .toSorted((left, right) => left - right),
        ).toEqual([0, 1]);
        expect(send).toHaveBeenCalledTimes(1);
        expect(
          rows.find((row) => !row.delivered_at)!.available_at.getTime(),
        ).toBeGreaterThan(Date.now());
        expect(
          (
            await scratch.pool.query(
              'SELECT attempts FROM audit_alert_dispatch_budget WHERE scope = $1',
              [scope === 'team' ? `team:${teamId}` : 'global'],
            )
          ).rows,
        ).toEqual([
          {
            attempts:
              scope === 'team'
                ? ALERT_EMAIL_TEAM_LIMIT
                : ALERT_EMAIL_DEPLOYMENT_LIMIT,
          },
        ]);
      } finally {
        await scratch.dispose();
      }
    },
  );

  it('keeps in-app delivery available when email admission is exhausted', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure();
      await scratch.append();
      await scratch.pool.query(
        "INSERT INTO audit_alert_dispatch_budget (scope, window_started_at, attempts) VALUES ('global', date_trunc('minute', clock_timestamp()) + interval '1 minute', $1)",
        [ALERT_EMAIL_DEPLOYMENT_LIMIT],
      );
      const send = vi.fn<AuditAlertMailer['sendAuditAlert']>();
      for (let pass = 0; pass < 3; pass++)
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce();
      expect(
        (await scratch.rows()).rows
          .map((row) => ({
            channel: row.channel,
            attempt: row.attempt_count,
            delivered: Boolean(row.delivered_at),
          }))
          .toSorted((a, b) => a.channel.localeCompare(b.channel)),
      ).toEqual([
        { channel: 'email', attempt: 0, delivered: false },
        { channel: 'in_app', attempt: 1, delivered: true },
      ]);
      expect(send).not.toHaveBeenCalled();
      expect((await listAuditAlerts(scratch.context)).items[0]).toMatchObject({
        inApp: true,
        emailState: 'pending',
      });
    } finally {
      await scratch.dispose();
    }
  });

  it('expires a bounded old backlog without sending it and keeps a fresh delivery eligible', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure([{ memberId, inApp: true, email: false }]);
      await scratch.append();
      const freshId = (await scratch.rows()).rows[0]!.id as string;
      await scratch.context.tenantDb.transaction(async (client) => {
        for (let index = 0; index < 101; index++)
          await store.append(client, candidate());
      });
      // created_at is immutable after insertion. Build old work at insertion
      // time, retaining real parent/preference identities and FK constraints.
      await scratch.pool.query(
        `WITH old_work AS (DELETE FROM audit_alert_deliveries WHERE id <> $1 RETURNING *)
        INSERT INTO audit_alert_deliveries (id, team_id, outbox_id, recipient_id, member_id, user_id, channel, created_at)
        SELECT id, team_id, outbox_id, recipient_id, member_id, user_id, channel, clock_timestamp() - interval '8 days' FROM old_work`,
        [freshId],
      );
      const adapter = new AuditAlertDeliveryAdapter({
        pool: scratch.maintenance,
        publicBaseUrl: 'https://studio.example.test',
      });
      expect(await adapter.suppressUndeliverable()).toBe(100);
      expect(
        (await scratch.rows()).rows.filter((row) => row.suppressed_at),
      ).toHaveLength(100);
      expect(await adapter.suppressUndeliverable()).toBe(1);
      expect(await scratch.dispatcher().runOnce()).toMatchObject({
        completed: 1,
      });
      const rows = (await scratch.rows()).rows;
      expect(
        rows.filter(
          (row) =>
            row.last_error === 'backlog_expired' && row.attempt_count === 0,
        ),
      ).toHaveLength(101);
      expect(rows.filter((row) => row.delivered_at)).toHaveLength(1);
    } finally {
      await scratch.dispose();
    }
  });

  it.each([
    'preference',
    'membership',
    'verification',
    'permission',
    'team',
  ] as const)('suppresses queued work after %s revocation', async (kind) => {
    const scratch = await fixture();
    try {
      const configured = await scratch.configure();
      await scratch.append();
      if (kind === 'preference')
        await scratch.configure([], configured.revision);
      if (kind === 'membership') {
        await scratch.pool.query('DELETE FROM team_members WHERE id = $1', [
          memberId,
        ]);
        await scratch.pool.query(
          "INSERT INTO team_members (id, team_id, user_id, role) VALUES ('rejoined-member', $1, $2, 'owner')",
          [teamId, userId],
        );
      }
      if (kind === 'verification')
        await scratch.pool.query(
          'UPDATE "user" SET "emailVerified" = false WHERE id = $1',
          [userId],
        );
      if (kind === 'permission')
        await scratch.pool.query(
          "UPDATE team_members SET role = 'member' WHERE id = $1",
          [memberId],
        );
      if (kind === 'team')
        await scratch.pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
      const send = vi.fn<AuditAlertMailer['sendAuditAlert']>();
      for (let pass = 0; pass < 3; pass++)
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce();
      expect(
        (await scratch.rows()).rows.every(
          (row) => row.suppressed_at && !row.send_started_at,
        ),
      ).toBe(true);
      expect((await scratch.rows()).rowCount).toBe(2);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await scratch.dispose();
    }
  });

  it('rechecks authorization after claim and keeps user read state scoped to delivered in-app alerts', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure([{ memberId, inApp: true, email: false }]);
      await scratch.append();
      expect((await listAuditAlerts(scratch.context)).items).toEqual([]);
      await scratch.dispatcher().runOnce();
      const feed = await listAuditAlerts(scratch.context);
      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]).toMatchObject({
        policy: 'credential_access',
        inApp: true,
        readAt: null,
        emailState: null,
      });
      await markAuditAlertRead(scratch.context, feed.items[0]!.id);
      expect(
        (await listAuditAlerts(scratch.context)).items[0]!.readAt,
      ).toBeInstanceOf(Date);
      await expect(
        markAuditAlertRead(scratch.context, randomUUID()),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await scratch.append();
      const adapter = new AuditAlertDeliveryAdapter({
        pool: scratch.maintenance,
        publicBaseUrl: 'https://studio.example.test',
      });
      const lease = { owner: randomUUID(), durationMs: 60_000 };
      const claim = await adapter.claim(lease, 8);
      expect(claim).not.toBeNull();
      await scratch.pool.query(
        "UPDATE team_members SET role = 'member' WHERE id = $1",
        [memberId],
      );
      expect(await adapter.deliver(claim!)).toBe('suppressed');
      await expect(listAuditAlerts(scratch.context)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    } finally {
      await scratch.dispose();
    }
  });

  it('clears proven retryable handoff and never retries terminal uncertainty after restart or acknowledgement', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure([{ memberId, inApp: false, email: true }]);
      await scratch.append();
      const send = vi
        .fn<AuditAlertMailer['sendAuditAlert']>()
        .mockRejectedValueOnce(new EmailDeliveryError('retryable'))
        .mockRejectedValueOnce(new EmailDeliveryError('uncertain'));
      expect(
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce(),
      ).toMatchObject({ retried: 1 });
      expect((await scratch.rows()).rows[0]).toMatchObject({
        send_started_at: null,
        uncertain_at: null,
        attempt_count: 1,
      });
      expect(
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce(),
      ).toMatchObject({ uncertain: 1 });
      const row = (await scratch.rows()).rows[0];
      expect(row.uncertain_at).toBeInstanceOf(Date);
      expect(row.send_started_at).toBeInstanceOf(Date);
      await acknowledgeAuditAlert(scratch.context, row.id as string);
      await acknowledgeAuditAlert(scratch.context, row.id as string);
      expect(
        (
          await scratch.pool.query(
            "SELECT count(*)::int AS count FROM audit_events WHERE event_type = 'audit.alert_delivery.acknowledged'",
          )
        ).rows[0],
      ).toEqual({ count: 1 });
      expect(
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce(),
      ).toMatchObject({ claimed: 0 });
      expect(send).toHaveBeenCalledTimes(2);
      expect((await listAuditAlerts(scratch.context)).items[0]).toMatchObject({
        emailState: 'uncertain',
        emailAcknowledgedAt: expect.any(Date),
      });
    } finally {
      await scratch.dispose();
    }
  });

  it('turns an expired started lease into durable uncertainty without handing it to another sender', async () => {
    const scratch = await fixture();
    try {
      await scratch.configure([{ memberId, inApp: false, email: true }]);
      await scratch.append();
      const adapter = new AuditAlertDeliveryAdapter({
        pool: scratch.maintenance,
        mailer: { sendAuditAlert: async () => undefined },
        publicBaseUrl: 'https://studio.example.test',
      });
      const lease = { owner: randomUUID(), durationMs: 60_000 };
      const claim = await adapter.claim(lease, 8);
      expect(claim).not.toBeNull();
      await scratch.pool.query(
        "UPDATE audit_alert_deliveries SET send_started_at = clock_timestamp(), lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
        [claim!.id],
      );
      const send = vi.fn<AuditAlertMailer['sendAuditAlert']>();
      expect(
        await scratch.dispatcher({ sendAuditAlert: send }).runOnce(),
      ).toMatchObject({ claimed: 0 });
      expect((await scratch.rows()).rows[0]).toMatchObject({
        uncertain_at: expect.any(Date),
        lease_owner: null,
        last_error: 'handoff_interrupted',
      });
      expect(send).not.toHaveBeenCalled();
    } finally {
      await scratch.dispose();
    }
  });

  it.each(['unconfirmed_handoff', 'retryable_rejection'] as const)(
    'recovers an actual killed worker after %s and reports durable uncertainty across collector restart',
    async (boundary) => {
      const scratch = await fixture();
      const peer = await smtpFixture(
        boundary === 'unconfirmed_handoff'
          ? 'silent_data'
          : 'reject_recipient_temporary',
      );
      const recoveryPeer = await smtpFixture();
      const mailer = createMailer({
        kind: 'smtp',
        url: recoveryPeer.url,
        from: 'sender@example.test',
      });
      let child: ReturnType<typeof fork> | undefined;
      let exited: Promise<unknown[]> | undefined;
      let runtime: ReturnType<typeof createObservability> | undefined;
      try {
        await scratch.configure([{ memberId, inApp: false, email: true }]);
        await scratch.append();
        const databaseUrl = scratch.pool.options.connectionString;
        if (typeof databaseUrl !== 'string')
          throw new Error('Missing synthetic fixture URL');
        child = fork(
          fileURLToPath(
            new URL('./fixtures/alert-worker-process.ts', import.meta.url),
          ),
          [],
          {
            execArgv: [],
            env: {
              NODE_ENV: 'test',
              STUDIO_ALERT_TEST_DATABASE_URL: databaseUrl,
              STUDIO_ALERT_TEST_SMTP_URL: peer.url,
            },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          },
        );
        exited = once(child, 'exit');
        let output = '';
        child.stdout?.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        const dispatchFinished = deferred();
        child.on('message', (event: unknown) => {
          if (
            event &&
            typeof event === 'object' &&
            'kind' in event &&
            event.kind === 'dispatch'
          )
            dispatchFinished.resolve();
        });
        expect(
          await Promise.race([
            (boundary === 'unconfirmed_handoff'
              ? peer.dataReceived
              : dispatchFinished.promise
            ).then(() => true),
            exited.then(() => false),
            delay(8_000, false, { ref: false }),
          ]),
          `child must reach the observed boundary: ${output}`,
        ).toBe(true);
        const original = (await scratch.rows()).rows[0]!;
        expect(original.attempt_count).toBe(1);
        expect(Boolean(original.send_started_at)).toBe(
          boundary === 'unconfirmed_handoff',
        );
        if (boundary === 'retryable_rejection')
          expect(original.last_error).toBe('send_retryable');
        child.kill('SIGKILL');
        expect(await exited).toEqual([null, 'SIGKILL']);
        await vi.waitFor(
          async () => {
            expect(
              (
                await scratch.pool.query(
                  'SELECT lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp() AS expired FROM audit_alert_deliveries',
                )
              ).rows,
            ).toEqual([{ expired: true }]);
          },
          { timeout: 2_000 },
        );
        expect(await scratch.dispatcher(mailer).runOnce()).toMatchObject({
          claimed: boundary === 'retryable_rejection' ? 1 : 0,
          completed: boundary === 'retryable_rejection' ? 1 : 0,
        });
        const recovered = (await scratch.rows()).rows[0]!;
        expect(Boolean(recovered.uncertain_at)).toBe(
          boundary === 'unconfirmed_handoff',
        );
        expect(Boolean(recovered.delivered_at)).toBe(
          boundary === 'retryable_rejection',
        );
        expect(recoveryPeer.messages).toHaveLength(
          boundary === 'retryable_rejection' ? 1 : 0,
        );

        const openRuntime = () =>
          createObservability({
            pool: scratch.app,
            maintenancePool: scratch.maintenance,
            cacheMs: 0,
          });
        const timestamp =
          recovered.uncertain_at instanceof Date
            ? recovered.uncertain_at.getTime() / 1000
            : 0;
        const sample = `studio_outbox_last_failure_timestamp_seconds{queue="audit_alert_outbox"} ${timestamp}`;
        for (let restart = 0; restart < 2; restart++) {
          runtime = openRuntime();
          const body = (await runtime.metrics.scrape()).body;
          expect(body).toContain(sample);
          expect(body).toContain(
            `studio_outbox_jobs{queue="audit_alert_outbox",state="uncertain"} ${boundary === 'unconfirmed_handoff' ? 1 : 0}`,
          );
          expect(body).not.toContain('studio_outbox_dispatch_results_total{');
          for (const canary of [
            teamId,
            userId,
            privateLabel,
            'researcher@example.test',
            original.id as string,
          ])
            expect(body).not.toContain(canary);
          runtime.stop();
        }
        // A live accepted sibling proves that the recovery sender runs, while
        // the original uncertain row remains terminal across another restart.
        await scratch.append();
        expect(await scratch.dispatcher(mailer).runOnce()).toMatchObject({
          completed: 1,
        });
        expect(await scratch.dispatcher(mailer).runOnce()).toMatchObject({
          claimed: 0,
        });
        expect(recoveryPeer.messages).toHaveLength(
          boundary === 'retryable_rejection' ? 2 : 1,
        );
      } finally {
        if (child && child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
        await exited;
        runtime?.stop();
        mailer.close();
        await Promise.all([peer.close(), recoveryPeer.close()]);
        await scratch.dispose();
      }
    },
    20_000,
  );

  it('retains confirmed acceptance after a renewal error, but cannot overwrite a replacement owner', async () => {
    const scratch = await fixture();
    const entered = deferred();
    const release = deferred();
    const renewed = deferred();
    const renewal = vi
      .spyOn(AuditAlertDeliveryAdapter.prototype, 'renewLease')
      .mockImplementation(async () => {
        renewed.resolve();
        throw new Error('private-database-error-canary');
      });
    try {
      await scratch.configure([{ memberId, inApp: false, email: true }]);
      await scratch.append();
      const running = scratch
        .dispatcher(
          {
            sendAuditAlert: async () => {
              entered.resolve();
              await release.promise;
            },
          },
          { leaseMs: 600 },
        )
        .runOnce();
      // A worker rejection must surface immediately, not become an unhandled
      // promise while this test waits for a send that never started.
      const premature = running.then(() => {
        throw new Error('Dispatch finished before its held send was released');
      });
      await Promise.race([entered.promise, premature]);
      await Promise.race([renewed.promise, premature]);
      release.resolve();
      expect(await running).toMatchObject({ completed: 1 });
      expect((await scratch.rows()).rows[0]).toMatchObject({
        delivered_at: expect.any(Date),
        uncertain_at: null,
      });
      renewal.mockRestore();
      await scratch.append();
      const adapter = new AuditAlertDeliveryAdapter({
        pool: scratch.maintenance,
        mailer: { sendAuditAlert: async () => undefined },
        publicBaseUrl: 'https://studio.example.test',
      });
      const lease = { owner: randomUUID(), durationMs: 60_000 };
      const claim = await adapter.claim(lease, 8);
      expect(claim).not.toBeNull();
      const replacement = randomUUID();
      await scratch.pool.query(
        'UPDATE audit_alert_deliveries SET lease_owner = $2 WHERE id = $1',
        [claim!.id, replacement],
      );
      expect(await adapter.recordComplete(claim!, lease)).toBe(false);
      expect(
        await adapter.recordUncertain(claim!, lease, new Error('canary')),
      ).toBe(false);
      expect(
        (
          await scratch.pool.query(
            'SELECT lease_owner, delivered_at, uncertain_at FROM audit_alert_deliveries WHERE id = $1',
            [claim!.id],
          )
        ).rows[0],
      ).toEqual({
        lease_owner: replacement,
        delivered_at: null,
        uncertain_at: null,
      });
    } finally {
      release.resolve();
      renewal.mockRestore();
      await scratch.dispose();
    }
  });

  it('emits only fixed alert content over a real SMTP wire and bounded metric metadata', async () => {
    const scratch = await fixture();
    const peer = await smtpFixture();
    const mailer = createMailer({
      kind: 'smtp',
      url: peer.url,
      from: 'Studio <sender@example.test>',
    });
    try {
      await scratch.configure([{ memberId, inApp: false, email: true }]);
      await scratch.append();
      const metrics: OutboxLifecycleEvent[] = [];
      expect(
        await scratch
          .dispatcher(mailer, {
            observer: (event) => {
              metrics.push(event);
            },
          })
          .runOnce(),
      ).toMatchObject({ completed: 1 });
      expect(peer.messages).toHaveLength(1);
      expect(peer.messages[0]).toContain(
        'An integration credential was accessed or changed.',
      );
      expect(peer.messages[0]).toContain(
        'https://studio.example.test/team/audit-alert-team/settings?alerts=1',
      );
      expect(peer.messages[0]).not.toContain(privateLabel);
      const delivered = (await scratch.rows()).rows[0]!;
      expect(peer.messages[0]!.replaceAll(/\r\n[\t ]+/g, ' ')).toContain(
        `Message-ID: <audit-alert-${delivered.id}@studio.networkcanvas.com>`,
      );
      expect(metrics).toContainEqual(
        expect.objectContaining({
          queue: 'audit_alert_outbox',
          kind: 'dispatch',
          completed: 1,
        }),
      );
      for (const canary of [
        teamId,
        userId,
        'researcher@example.test',
        privateLabel,
      ])
        expect(JSON.stringify(metrics)).not.toContain(canary);
    } finally {
      mailer.close();
      await peer.close();
      await scratch.dispose();
    }
  });

  it('cancels a held SMTP attempt, persists uncertainty and stops claiming before shutdown', async () => {
    const scratch = await fixture();
    const peer = await smtpFixture('silent_data');
    const mailer = createMailer({
      kind: 'smtp',
      url: peer.url,
      from: 'sender@example.test',
    });
    let stopping: Promise<void> | undefined;
    let worker: ReturnType<typeof startAuditAlertWorker> | undefined;
    try {
      await scratch.configure([{ memberId, inApp: false, email: true }]);
      await scratch.append();
      await scratch.append();
      const workerFailed = deferred();
      worker = startAuditAlertWorker({
        pool: scratch.maintenance,
        mailer,
        publicBaseUrl: 'https://studio.example.test',
        pollIntervalMs: 60_000,
        observer: (event) => {
          if (event.kind === 'worker_error') workerFailed.resolve();
        },
      });
      expect(
        await Promise.race([
          peer.dataReceived.then(() => true),
          workerFailed.promise.then(() => false),
        ]),
      ).toBe(true);
      stopping = worker.stop();
      expect(
        await Promise.race([
          stopping.then(() => true),
          delay(8000, false, { ref: false }),
        ]),
        'SMTP uncertainty must commit before the production shutdown backstop',
      ).toBe(true);
      expect(
        (await scratch.rows()).rows
          .map((row) => ({
            attempt: row.attempt_count,
            uncertain: Boolean(row.uncertain_at),
          }))
          .toSorted((a, b) => a.attempt - b.attempt),
      ).toEqual([
        { attempt: 0, uncertain: false },
        { attempt: 1, uncertain: true },
      ]);
      expect(peer.messages).toHaveLength(1);
    } finally {
      mailer.close();
      stopping ??= worker?.stop();
      await stopping;
      await peer.close();
      await scratch.dispose();
    }
  });
});
