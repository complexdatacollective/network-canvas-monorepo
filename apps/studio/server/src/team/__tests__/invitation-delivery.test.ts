import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import type { InvitationMailer } from '../../auth/email.ts';
import { cancelTeamInvitation } from '../commands.ts';
import {
  InvitationDeliveryDispatcher,
  InvitationDeliveryRoleError,
} from '../invitation-delivery-dispatcher.ts';
import { enqueueInvitationDelivery } from '../invitation-delivery-store.ts';

const db = await reachableDb();

const TEAM_ID = 'invitation-delivery-team';
const INVITER_ID = 'invitation-delivery-inviter';
const INVITER_MEMBER_ID = 'invitation-delivery-inviter-member';

type ScratchSchema = Awaited<ReturnType<typeof createScratchSchema>>;

async function seedInvitation(
  scratch: ScratchSchema,
  input: {
    invitationId?: string;
    email?: string;
    status?: string;
    expiresAt?: Date;
  } = {},
) {
  const invitationId = input.invitationId ?? randomUUID();
  const email = input.email ?? `${invitationId}@example.com`;
  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await scratch.pool.query(
    `INSERT INTO team_invitations (
       id, team_id, email, role, status, expires_at, inviter_id
     ) VALUES ($1, $2, $3, 'member', $4, $5, $6)`,
    [
      invitationId,
      TEAM_ID,
      email,
      input.status ?? 'pending',
      expiresAt,
      INVITER_ID,
    ],
  );
  return { invitationId, email, expiresAt };
}

async function enqueue(
  scratch: ScratchSchema,
  invitation: Awaited<ReturnType<typeof seedInvitation>>,
) {
  const tenant = createTenantDb(scratch.app, TEAM_ID);
  await tenant.transaction((client) =>
    enqueueInvitationDelivery(client, {
      invitationId: invitation.invitationId,
      teamId: TEAM_ID,
      email: invitation.email,
      role: 'member',
      teamLabel: 'Invitation Delivery Team',
      inviterLabel: 'Inviting Researcher',
      expiresAt: invitation.expiresAt,
    }),
  );
}

function dispatcher(
  pool: pg.Pool,
  mailer: InvitationMailer,
  overrides: Partial<
    ConstructorParameters<typeof InvitationDeliveryDispatcher>[0]
  > = {},
) {
  return new InvitationDeliveryDispatcher({
    pool,
    mailer,
    publicBaseUrl: 'https://studio.example.test',
    retryBaseMs: 0,
    retryMaxMs: 0,
    ...overrides,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!db)('invitation delivery outbox', () => {
  let scratch: ScratchSchema;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    await scratch.pool.query(
      `INSERT INTO "user" (
         id, name, email, "emailVerified", "createdAt", "updatedAt"
       ) VALUES ($1, 'Inviting Researcher', 'inviter@example.com', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [INVITER_ID],
    );
    await scratch.pool.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Invitation Delivery Team', $1)`,
      [TEAM_ID],
    );
    await scratch.pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')`,
      [INVITER_MEMBER_ID, TEAM_ID, INVITER_ID],
    );
  });

  afterAll(async () => {
    await scratch?.dispose();
  });

  it('persists the invitation payload only when its surrounding transaction commits', async () => {
    const invitation = await seedInvitation(scratch);
    const tenant = createTenantDb(scratch.app, TEAM_ID);

    await expect(
      tenant.transaction(async (client) => {
        await enqueueInvitationDelivery(client, {
          invitationId: invitation.invitationId,
          teamId: TEAM_ID,
          email: invitation.email,
          role: 'member',
          teamLabel: 'Invitation Delivery Team',
          inviterLabel: 'Inviting Researcher',
          expiresAt: invitation.expiresAt,
        });
        throw new Error('roll back command');
      }),
    ).rejects.toThrow('roll back command');

    const deliveries = await scratch.pool.query(
      `SELECT id FROM team_invitation_deliveries WHERE invitation_id = $1`,
      [invitation.invitationId],
    );
    expect(deliveries.rowCount).toBe(0);
  });

  it('persists a failed attempt and a fresh dispatcher retries it after restart', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    await scratch.pool.query(
      `UPDATE teams SET name = 'Renamed Team' WHERE id = $1`,
      [TEAM_ID],
    );
    await scratch.pool.query(
      `UPDATE "user" SET name = 'Renamed Inviter' WHERE id = $1`,
      [INVITER_ID],
    );
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockRejectedValueOnce(new Error('SMTP temporarily unavailable'))
      .mockResolvedValue(undefined);

    const firstRun = await dispatcher(scratch.maintenance, {
      sendTeamInvitation,
    }).runOnce();
    expect(firstRun).toEqual({ claimed: 1, sent: 0, failed: 1, suppressed: 0 });

    const afterFailure = await scratch.pool.query<{
      attempt_count: number;
      last_error: string;
      sent_at: Date | null;
    }>(
      `SELECT attempt_count, last_error, sent_at
       FROM team_invitation_deliveries WHERE invitation_id = $1`,
      [invitation.invitationId],
    );
    expect(afterFailure.rows).toEqual([
      {
        attempt_count: 1,
        last_error: 'SMTP temporarily unavailable',
        sent_at: null,
      },
    ]);

    const secondRun = await dispatcher(scratch.maintenance, {
      sendTeamInvitation,
    }).runOnce();
    expect(secondRun).toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
      suppressed: 0,
    });
    expect(sendTeamInvitation).toHaveBeenLastCalledWith({
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      invitationUrl: `https://studio.example.test/invitations/${invitation.invitationId}`,
      inviterLabel: 'Inviting Researcher',
      messageId: `<studio-invitation.${invitation.invitationId}@networkcanvas.local>`,
      role: 'member',
      teamLabel: 'Invitation Delivery Team',
    });
  });

  it('stops retrying after the bounded attempt limit', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockRejectedValue(new Error('permanent SMTP failure'));
    const delivery = dispatcher(
      scratch.maintenance,
      { sendTeamInvitation },
      { maxAttempts: 2 },
    );

    await expect(delivery.runOnce()).resolves.toMatchObject({ failed: 1 });
    await expect(delivery.runOnce()).resolves.toMatchObject({ failed: 1 });
    await expect(delivery.runOnce()).resolves.toMatchObject({ claimed: 0 });
    expect(sendTeamInvitation).toHaveBeenCalledTimes(2);

    const failed = await scratch.pool.query<{
      attempt_count: number;
      failed_at: Date | null;
    }>(
      `SELECT attempt_count, failed_at
       FROM team_invitation_deliveries WHERE invitation_id = $1`,
      [invitation.invitationId],
    );
    expect(failed.rows[0]?.attempt_count).toBe(2);
    expect(failed.rows[0]?.failed_at).toBeInstanceOf(Date);
  });

  it('reclaims an expired lease left behind when a worker stops', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    await scratch.pool.query(
      `UPDATE team_invitation_deliveries
       SET attempt_count = 1,
           lease_owner = $2,
           lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
       WHERE invitation_id = $1`,
      [invitation.invitationId, randomUUID()],
    );
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);

    await expect(
      dispatcher(
        scratch.maintenance,
        { sendTeamInvitation },
        { maxAttempts: 2 },
      ).runOnce(),
    ).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(sendTeamInvitation).toHaveBeenCalledOnce();
  });

  it('marks a final expired lease failed instead of stranding the delivery', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    await scratch.pool.query(
      `UPDATE team_invitation_deliveries
       SET attempt_count = 2,
           lease_owner = $2,
           lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
       WHERE invitation_id = $1`,
      [invitation.invitationId, randomUUID()],
    );
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);

    await expect(
      dispatcher(
        scratch.maintenance,
        { sendTeamInvitation },
        { maxAttempts: 2 },
      ).runOnce(),
    ).resolves.toEqual({
      claimed: 0,
      sent: 0,
      failed: 1,
      suppressed: 0,
    });
    expect(sendTeamInvitation).not.toHaveBeenCalled();
    const failed = await scratch.pool.query<{ failed_at: Date | null }>(
      `SELECT failed_at FROM team_invitation_deliveries WHERE invitation_id = $1`,
      [invitation.invitationId],
    );
    expect(failed.rows[0]?.failed_at).toBeInstanceOf(Date);
  });

  it('allows only one concurrent worker to claim a delivery', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    let releaseSend: (() => void) | undefined;
    const sending = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockReturnValue(sending);
    const first = dispatcher(scratch.maintenance, { sendTeamInvitation });
    const second = dispatcher(scratch.maintenance, { sendTeamInvitation });

    const firstRun = first.runOnce();
    await vi.waitFor(() => expect(sendTeamInvitation).toHaveBeenCalledOnce());
    const secondResult = await second.runOnce();
    expect(secondResult.claimed).toBe(0);
    releaseSend?.();
    await expect(firstRun).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(sendTeamInvitation).toHaveBeenCalledOnce();
  });

  it('keeps a slow send claimed so a second worker cannot deliver it', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    const slowSend = deferred();
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockReturnValueOnce(slowSend.promise)
      .mockResolvedValue(undefined);
    const first = dispatcher(
      scratch.maintenance,
      { sendTeamInvitation },
      { leaseMs: 150 },
    );
    const second = dispatcher(
      scratch.maintenance,
      { sendTeamInvitation },
      { leaseMs: 150 },
    );

    const firstRun = first.runOnce();
    await vi.waitFor(() => expect(sendTeamInvitation).toHaveBeenCalledOnce());
    // PostgreSQL's clock advances past the original lease while Node remains
    // free to run the ownership-checked heartbeat.
    await scratch.maintenance.query(`SELECT pg_sleep(0.45)`);
    const secondResult = await second.runOnce();
    slowSend.resolve();
    const firstResult = await firstRun;

    expect(secondResult.claimed).toBe(0);
    expect(firstResult).toMatchObject({ claimed: 1, sent: 1 });
    expect(sendTeamInvitation).toHaveBeenCalledOnce();
  });

  it('does not report or persist sent after losing delivery ownership', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    const slowSend = deferred();
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockReturnValue(slowSend.promise);
    const delivery = dispatcher(
      scratch.maintenance,
      { sendTeamInvitation },
      { leaseMs: 5_000 },
    );

    const deliveryRun = delivery.runOnce();
    await vi.waitFor(() => expect(sendTeamInvitation).toHaveBeenCalledOnce());
    const replacementOwner = randomUUID();
    await scratch.maintenance.query(
      `UPDATE team_invitation_deliveries
       SET lease_owner = $2,
           lease_expires_at = clock_timestamp() + INTERVAL '5 seconds'
       WHERE invitation_id = $1`,
      [invitation.invitationId, replacementOwner],
    );
    slowSend.resolve();

    await expect(deliveryRun).resolves.toMatchObject({ claimed: 1, sent: 0 });
    expect(
      await scratch.pool.query(
        `SELECT lease_owner, sent_at
         FROM team_invitation_deliveries WHERE invitation_id = $1`,
        [invitation.invitationId],
      ),
    ).toHaveProperty('rows', [
      { lease_owner: replacementOwner, sent_at: null },
    ]);
  });

  it('lets cancellation win its invitation lock before a worker can claim', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);
    const delivery = dispatcher(scratch.maintenance, { sendTeamInvitation });
    const tenant = createTenantDb(scratch.app, TEAM_ID);

    await tenant.transaction(async (client) => {
      await client.query(
        `SELECT id FROM team_invitations
         WHERE team_id = $1 AND id = $2
         FOR UPDATE`,
        [TEAM_ID, invitation.invitationId],
      );
      await expect(delivery.runOnce()).resolves.toMatchObject({ claimed: 0 });
      await client.query(
        `UPDATE team_invitations SET status = 'canceled'
         WHERE team_id = $1 AND id = $2`,
        [TEAM_ID, invitation.invitationId],
      );
    });

    await expect(delivery.runOnce()).resolves.toMatchObject({ suppressed: 1 });
    expect(sendTeamInvitation).not.toHaveBeenCalled();
  });

  it('rejects and audits cancellation after delivery has begun', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);
    const slowSend = deferred();
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockReturnValue(slowSend.promise);
    const delivery = dispatcher(scratch.maintenance, { sendTeamInvitation });

    const deliveryRun = delivery.runOnce();
    await vi.waitFor(() => expect(sendTeamInvitation).toHaveBeenCalledOnce());
    await expect(
      cancelTeamInvitation(
        {
          tenantDb: createTenantDb(scratch.app, TEAM_ID),
          principal: {
            kind: 'user',
            userId: INVITER_ID,
            email: 'inviter@example.com',
            emailVerified: true,
            name: 'Inviting Researcher',
            sessionId: 'invitation-delivery-session',
          },
          requestId: randomUUID(),
        },
        { invitationId: invitation.invitationId },
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_IN_PROGRESS' });

    expect(
      await scratch.pool.query(
        `SELECT status FROM team_invitations WHERE id = $1`,
        [invitation.invitationId],
      ),
    ).toHaveProperty('rows', [{ status: 'pending' }]);
    expect(
      await scratch.pool.query(
        `SELECT event_type, outcome, subject_id, details
         FROM audit_events
         WHERE team_id = $1 AND subject_id = $2`,
        [TEAM_ID, invitation.invitationId],
      ),
    ).toHaveProperty('rows', [
      {
        event_type: 'team.invitation.cancellation_failed',
        outcome: 'failed',
        subject_id: invitation.invitationId,
        details: { failureCode: 'delivery_in_progress' },
      },
    ]);

    slowSend.resolve();
    await expect(deliveryRun).resolves.toMatchObject({ sent: 1 });
  });

  it('suppresses pending deliveries after their invitations are canceled or expire', async () => {
    const canceled = await seedInvitation(scratch);
    const expired = await seedInvitation(scratch);
    await enqueue(scratch, canceled);
    await enqueue(scratch, expired);
    await scratch.pool.query(
      `UPDATE team_invitations
       SET status = CASE WHEN id = $1 THEN 'canceled' ELSE status END,
           expires_at = CASE WHEN id = $2 THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE expires_at END
       WHERE id IN ($1, $2)`,
      [canceled.invitationId, expired.invitationId],
    );
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);

    const result = await dispatcher(scratch.maintenance, {
      sendTeamInvitation,
    }).runOnce();

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0, suppressed: 2 });
    expect(sendTeamInvitation).not.toHaveBeenCalled();
    const suppressed = await scratch.pool.query<{
      invitation_id: string;
      suppressed_at: Date | null;
    }>(
      `SELECT invitation_id, suppressed_at
       FROM team_invitation_deliveries
       WHERE invitation_id IN ($1, $2)
       ORDER BY invitation_id`,
      [canceled.invitationId, expired.invitationId],
    );
    expect(suppressed.rows).toHaveLength(2);
    expect(
      suppressed.rows.every((row) => row.suppressed_at instanceof Date),
    ).toBe(true);
  });

  it('refuses to dispatch from an application-role pool', async () => {
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);
    await expect(
      dispatcher(scratch.app, { sendTeamInvitation }).runOnce(),
    ).rejects.toBeInstanceOf(InvitationDeliveryRoleError);
    expect(sendTeamInvitation).not.toHaveBeenCalled();
  });

  it('allows application commands to enqueue but not alter delivery state', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);

    await expect(
      scratch.app.query(
        `UPDATE team_invitation_deliveries SET sent_at = CURRENT_TIMESTAMP`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('lets maintenance advance delivery state without rewriting its payload', async () => {
    const invitation = await seedInvitation(scratch);
    await enqueue(scratch, invitation);

    await expect(
      scratch.maintenance.query(
        `UPDATE team_invitation_deliveries
         SET available_at = CURRENT_TIMESTAMP
         WHERE invitation_id = $1`,
        [invitation.invitationId],
      ),
    ).resolves.toHaveProperty('rowCount', 1);
    await expect(
      scratch.maintenance.query(
        `UPDATE team_invitation_deliveries
         SET email = 'rewritten@example.com'
         WHERE invitation_id = $1`,
        [invitation.invitationId],
      ),
    ).rejects.toThrow('invitation delivery payload is immutable');
  });

  it('structurally rejects an outbox row assigned to another team', async () => {
    const invitation = await seedInvitation(scratch);

    await expect(
      scratch.pool.query(
        `INSERT INTO team_invitation_deliveries (
           id, invitation_id, team_id, email, role, team_label, inviter_label, expires_at
         ) VALUES ($1, $2, 'different-team', $3, 'member', 'Other Team', 'Inviter', $4)`,
        [
          randomUUID(),
          invitation.invitationId,
          invitation.email,
          invitation.expiresAt,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
