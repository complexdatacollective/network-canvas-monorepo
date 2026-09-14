// Invitation delivery, now that the queue owns when an attempt runs (#1895).
// The delivery row is still the record — what was sent, to whom, and how it
// ended — so every case here is about what the handler writes to it and what
// it refuses to write twice. The cases that were about the hand-written
// lease (reclaiming an expired one, failing a final one, keeping ownership
// across a slow send) are gone: pg-boss owns that, and what they were really
// protecting — one send per invitation — is proven by the two-worker, the
// in-flight and the bounded-attempt cases below.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import type { InvitationMailer } from '../../auth/email.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import type { JobClient } from '../../jobs/client.ts';
import {
  createInvitationDeliveryHandler,
  type InvitationDeliveryJobView,
  registerInvitationDelivery,
} from '../../jobs/handlers/invitation-delivery.ts';
import { cancelTeamInvitation, createTeamInvitation } from '../commands.ts';
import { enqueueInvitationDelivery } from '../invitation-delivery-store.ts';

const db = await reachableDb();

const TEAM_ID = 'invitation-delivery-team';
const INVITER_ID = 'invitation-delivery-inviter';
const INVITER_MEMBER_ID = 'invitation-delivery-inviter-member';
const PUBLIC_BASE_URL = 'https://studio.example.test';

/** What the `invitation-delivery` queue declares: eight attempts in all. */
const RETRY_LIMIT = 7;

/** A worked queue can take a moment; a hung one must not take the file down. */
const WORKED_JOB_TIMEOUT_MS = 20_000;

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: INVITER_ID,
  email: 'inviter@example.com',
  emailVerified: true,
  name: 'Inviting Researcher',
  locale: null,
  sessionId: 'invitation-delivery-session',
};

type SeededInvitation = {
  invitationId: string;
  email: string;
  expiresAt: Date;
};

type DeliveryRow = {
  attempt_count: number;
  failed_at: Date | null;
  last_error: string | null;
  sent_at: Date | null;
  suppressed_at: Date | null;
  uncertain_at: Date | null;
};

type JobRow = { id: string; name: string; state: string; data: unknown };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mailerThat(
  sendTeamInvitation: InvitationMailer['sendTeamInvitation'],
): InvitationMailer {
  return { sendTeamInvitation };
}

describe.skipIf(!db)('invitation delivery on the queue', () => {
  let scratch: ScratchSchema;
  let jobs: JobClient;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    jobs = await scratch.createJobClient();
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

  async function seedInvitation(
    input: {
      invitationId?: string;
      email?: string;
      status?: string;
      expiresAt?: Date;
    } = {},
  ): Promise<SeededInvitation> {
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

  /** The delivery row alone, for the cases that drive the handler directly. */
  async function seedDelivery(invitation: SeededInvitation): Promise<string> {
    const tenant = createTenantDb(scratch.app, TEAM_ID);
    const delivery = await tenant.transaction((client) =>
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
    return delivery.deliveryId;
  }

  /** The delivery row and its job, the way the command creates both. */
  async function seedQueuedDelivery(
    invitation: SeededInvitation,
  ): Promise<{ deliveryId: string; jobId: string }> {
    const tenant = createTenantDb(scratch.app, TEAM_ID);
    return tenant.transaction(async (client) => {
      const delivery = await enqueueInvitationDelivery(client, {
        invitationId: invitation.invitationId,
        teamId: TEAM_ID,
        email: invitation.email,
        role: 'member',
        teamLabel: 'Invitation Delivery Team',
        inviterLabel: 'Inviting Researcher',
        expiresAt: invitation.expiresAt,
      });
      const jobId = await jobs.enqueue(client, 'invitation-delivery', {
        deliveryId: delivery.deliveryId,
      });
      return { deliveryId: delivery.deliveryId, jobId };
    });
  }

  function handlerWith(mailer: InvitationMailer) {
    return createInvitationDeliveryHandler({
      maintenancePool: scratch.maintenance,
      mailer,
      publicBaseUrl: PUBLIC_BASE_URL,
    });
  }

  function jobFor(
    deliveryId: string,
    retryCount = 0,
    retryLimit = RETRY_LIMIT,
  ): InvitationDeliveryJobView {
    return { id: randomUUID(), data: { deliveryId }, retryCount, retryLimit };
  }

  async function deliveryState(deliveryId: string): Promise<DeliveryRow> {
    const rows = await scratch.pool.query<DeliveryRow>(
      `SELECT attempt_count, failed_at, last_error, sent_at, suppressed_at,
              uncertain_at
       FROM team_invitation_deliveries WHERE id = $1`,
      [deliveryId],
    );
    const row = rows.rows[0];
    if (!row) throw new Error(`no delivery row for ${deliveryId}`);
    return row;
  }

  /** Read as the owner: neither application nor maintenance role is meant to. */
  async function queuedJobs(deliveryId: string): Promise<JobRow[]> {
    const rows = await scratch.pool.query<JobRow>(
      `select id, name, state, data from ${scratch.jobSchema}.job_common
        where data->>'deliveryId' = $1
        order by name`,
      [deliveryId],
    );
    return rows.rows;
  }

  /**
   * A worker's case starts from an empty queue. The cases above leave jobs
   * nothing ever works — proving the job exists is their whole point — and
   * pg-boss fetches the oldest first, so a worker would otherwise spend its
   * window on another case's invitation instead of its own.
   */
  async function drainQueue(): Promise<void> {
    await scratch.pool.query(`delete from ${scratch.jobSchema}.job`);
  }

  async function jobState(jobId: string): Promise<string | undefined> {
    const rows = await scratch.pool.query<{ state: string }>(
      `select state from ${scratch.jobSchema}.job_common where id = $1`,
      [jobId],
    );
    return rows.rows[0]?.state;
  }

  it('creates the delivery and its job only when the transaction commits', async () => {
    const abandoned = await seedInvitation();
    let abandonedDeliveryId = '';
    await expect(
      createTenantDb(scratch.app, TEAM_ID).transaction(async (client) => {
        const delivery = await enqueueInvitationDelivery(client, {
          invitationId: abandoned.invitationId,
          teamId: TEAM_ID,
          email: abandoned.email,
          role: 'member',
          teamLabel: 'Invitation Delivery Team',
          inviterLabel: 'Inviting Researcher',
          expiresAt: abandoned.expiresAt,
        });
        abandonedDeliveryId = delivery.deliveryId;
        await jobs.enqueue(client, 'invitation-delivery', {
          deliveryId: delivery.deliveryId,
        });
        throw new Error('roll back command');
      }),
    ).rejects.toThrow('roll back command');

    expect(
      await scratch.pool.query(
        `SELECT id FROM team_invitation_deliveries WHERE invitation_id = $1`,
        [abandoned.invitationId],
      ),
    ).toHaveProperty('rowCount', 0);
    // The job was created on the command's own client, so the rollback took
    // it too. A job that survived would send mail for an invitation that does
    // not exist.
    expect(await queuedJobs(abandonedDeliveryId)).toEqual([]);

    const committed = await seedInvitation();
    const { deliveryId, jobId } = await seedQueuedDelivery(committed);
    expect(await queuedJobs(deliveryId)).toEqual([
      {
        id: jobId,
        name: 'invitation-delivery',
        state: 'created',
        data: { deliveryId },
      },
    ]);
  });

  it('carries the delivery id and nothing else in the payload', async () => {
    const invitation = await seedInvitation();
    const { deliveryId } = await seedQueuedDelivery(invitation);

    const [queued] = await queuedJobs(deliveryId);
    // Identifiers only (#1895): the job table is one table for every team, so
    // the address, the labels and the invitation stay in the tenant row the
    // handler loads under the maintenance role.
    expect(queued?.data).toEqual({ deliveryId });
  });

  it('creates the invitation, the delivery and one job in one command', async () => {
    const email = `${randomUUID()}@example.com`;
    const created = await createTeamInvitation(
      {
        tenantDb: createTenantDb(scratch.app, TEAM_ID),
        principal: PRINCIPAL,
        requestId: randomUUID(),
        jobs,
      },
      { email, role: 'member' },
    );

    const delivery = await scratch.pool.query<{ id: string }>(
      `SELECT id FROM team_invitation_deliveries WHERE invitation_id = $1`,
      [created.invitationId],
    );
    const deliveryId = delivery.rows[0]?.id;
    expect(deliveryId).toBeTypeOf('string');
    expect(await queuedJobs(deliveryId!)).toMatchObject([
      { name: 'invitation-delivery', state: 'created' },
    ]);
  });

  it('refuses to create an invitation it cannot queue', async () => {
    const email = `${randomUUID()}@example.com`;
    // No job client at all is a wiring fault, and committing the invitation
    // anyway would leave a researcher waiting on mail nothing will send.
    await expect(
      createTeamInvitation(
        {
          tenantDb: createTenantDb(scratch.app, TEAM_ID),
          principal: PRINCIPAL,
          requestId: randomUUID(),
        },
        { email, role: 'member' },
      ),
    ).rejects.toThrow('invitation delivery needs a job client');
    expect(
      await scratch.pool.query(
        `SELECT id FROM team_invitations WHERE team_id = $1 AND email = $2`,
        [TEAM_ID, email],
      ),
    ).toHaveProperty('rowCount', 0);
  });

  it('records a failed attempt and sends the snapshot on the next one', async () => {
    const invitation = await seedInvitation();
    const deliveryId = await seedDelivery(invitation);
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
    const handler = handlerWith(mailerThat(sendTeamInvitation));

    await expect(handler([jobFor(deliveryId, 0)])).rejects.toThrow(
      'SMTP temporarily unavailable',
    );
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 1,
      failed_at: null,
      last_error: 'SMTP temporarily unavailable',
      sent_at: null,
    });

    await expect(handler([jobFor(deliveryId, 1)])).resolves.toBeUndefined();
    // The labels are the ones the command snapshotted, not the renamed team
    // and inviter: the invitation says what it said when it was sent.
    expect(sendTeamInvitation).toHaveBeenLastCalledWith({
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      invitationUrl: `${PUBLIC_BASE_URL}/invitations/${invitation.invitationId}`,
      inviterLabel: 'Inviting Researcher',
      messageId: `<studio-invitation.${invitation.invitationId}@networkcanvas.local>`,
      role: 'member',
      teamLabel: 'Invitation Delivery Team',
    });
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 2,
      last_error: null,
      sent_at: expect.any(Date),
    });
  });

  it('does not retry after SMTP accepts mail but the sent marker cannot commit', async () => {
    const invitation = await seedInvitation();
    const deliveryId = await seedDelivery(invitation);
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);
    const handler = handlerWith(mailerThat(sendTeamInvitation));
    await scratch.pool.query(`
      CREATE FUNCTION interrupt_invitation_sent_finalization() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'sent finalization interrupted';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER interrupt_invitation_sent_finalization
        BEFORE UPDATE ON team_invitation_deliveries
        FOR EACH ROW
        WHEN (NEW.sent_at IS NOT NULL AND OLD.sent_at IS NULL)
        EXECUTE FUNCTION interrupt_invitation_sent_finalization();
    `);

    // Resolves rather than throws: a job that failed here would be retried,
    // and the mail has already gone (#1305, #1307).
    await expect(
      handler([jobFor(deliveryId, 0)]).finally(async () => {
        await scratch.pool.query(`
          DROP TRIGGER interrupt_invitation_sent_finalization
            ON team_invitation_deliveries;
          DROP FUNCTION interrupt_invitation_sent_finalization();
        `);
      }),
    ).resolves.toBeUndefined();
    expect(await deliveryState(deliveryId)).toEqual({
      attempt_count: 1,
      failed_at: null,
      last_error: 'sent finalization interrupted',
      sent_at: null,
      suppressed_at: null,
      uncertain_at: expect.any(Date),
    });

    await expect(handler([jobFor(deliveryId, 1)])).resolves.toBeUndefined();
    expect(sendTeamInvitation).toHaveBeenCalledOnce();
    // Not even the attempt counter moves: an uncertain delivery is finished.
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: 1,
      uncertain_at: expect.any(Date),
    });
  });

  it('records the delivery failed on the attempt the queue will not retry', async () => {
    const invitation = await seedInvitation();
    const deliveryId = await seedDelivery(invitation);
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockRejectedValue(new Error('permanent SMTP failure'));
    const handler = handlerWith(mailerThat(sendTeamInvitation));

    // The last attempt pg-boss will make: it fails the job after this one, so
    // the row has to record the end here or disagree with the dead letter.
    await expect(
      handler([jobFor(deliveryId, RETRY_LIMIT, RETRY_LIMIT)]),
    ).rejects.toThrow('permanent SMTP failure');
    expect(await deliveryState(deliveryId)).toMatchObject({
      attempt_count: RETRY_LIMIT + 1,
      failed_at: expect.any(Date),
      last_error: 'permanent SMTP failure',
      sent_at: null,
    });
  });

  it('dead-letters a delivery whose attempts are exhausted', async () => {
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockRejectedValue(new Error('permanent SMTP failure'));
    await drainQueue();
    const worker = scratch.createJobWorker();
    await worker.start();
    try {
      // One attempt rather than eight, so the case observes the end of the
      // retry ladder without waiting out its backoff. The job copies the
      // queue's limit when it is created, so this has to happen first.
      await worker.boss.updateQueue('invitation-delivery', { retryLimit: 0 });
      await registerInvitationDelivery(worker.boss, {
        maintenancePool: scratch.maintenance,
        mailer: mailerThat(sendTeamInvitation),
        publicBaseUrl: PUBLIC_BASE_URL,
      });

      const invitation = await seedInvitation();
      const { deliveryId, jobId } = await seedQueuedDelivery(invitation);
      await vi.waitFor(
        async () => expect(await jobState(jobId)).toBe('failed'),
        { timeout: WORKED_JOB_TIMEOUT_MS, interval: 100 },
      );

      expect(await queuedJobs(deliveryId)).toMatchObject([
        { name: 'invitation-delivery', state: 'failed' },
        // The copy #1307's manual re-send will work from, naming the same
        // delivery as the job that failed.
        { name: 'invitation-delivery-dead-letter', state: 'created' },
      ]);
      expect(await deliveryState(deliveryId)).toMatchObject({
        failed_at: expect.any(Date),
        last_error: 'permanent SMTP failure',
      });
    } finally {
      await worker.boss
        .updateQueue('invitation-delivery', { retryLimit: RETRY_LIMIT })
        .catch(() => undefined);
      await worker.stop();
    }
  });

  it('suppresses deliveries whose invitations are cancelled or expired', async () => {
    const cancelled = await seedInvitation();
    const expired = await seedInvitation();
    const cancelledDelivery = await seedDelivery(cancelled);
    const expiredDelivery = await seedDelivery(expired);
    await scratch.pool.query(
      `UPDATE team_invitations
       SET status = CASE WHEN id = $1 THEN 'canceled' ELSE status END,
           expires_at = CASE WHEN id = $2 THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE expires_at END
       WHERE id IN ($1, $2)`,
      [cancelled.invitationId, expired.invitationId],
    );
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);
    const handler = handlerWith(mailerThat(sendTeamInvitation));

    await expect(handler([jobFor(cancelledDelivery)])).resolves.toBeUndefined();
    await expect(handler([jobFor(expiredDelivery)])).resolves.toBeUndefined();

    expect(sendTeamInvitation).not.toHaveBeenCalled();
    expect(await deliveryState(cancelledDelivery)).toMatchObject({
      last_error: 'invitation is no longer pending',
      suppressed_at: expect.any(Date),
    });
    expect(await deliveryState(expiredDelivery)).toMatchObject({
      last_error: 'invitation expired',
      suppressed_at: expect.any(Date),
    });
  });

  it('sends once when two workers hold the same queue', async () => {
    const sending = deferred();
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockReturnValue(sending.promise);
    const deps = {
      maintenancePool: scratch.maintenance,
      mailer: mailerThat(sendTeamInvitation),
      publicBaseUrl: PUBLIC_BASE_URL,
    };
    await drainQueue();
    const workers = [scratch.createJobWorker(), scratch.createJobWorker()];
    try {
      // Both are listening before the job exists, so the insert's notification
      // wakes them together and they race for it — which is the state a second
      // replica is in when a deployment scales out.
      for (const worker of workers) {
        await worker.start();
        await registerInvitationDelivery(worker.boss, deps);
      }

      const invitation = await seedInvitation();
      const { deliveryId } = await seedQueuedDelivery(invitation);
      await vi.waitFor(
        () => expect(sendTeamInvitation).toHaveBeenCalledOnce(),
        { timeout: WORKED_JOB_TIMEOUT_MS, interval: 25 },
      );
      // The winner holds the job active and the invitation locked; this is the
      // window in which the loser would send a second copy.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(sendTeamInvitation).toHaveBeenCalledOnce();

      sending.resolve();
      await vi.waitFor(
        async () =>
          expect(await deliveryState(deliveryId)).toMatchObject({
            sent_at: expect.any(Date),
          }),
        { timeout: WORKED_JOB_TIMEOUT_MS, interval: 50 },
      );
      expect(sendTeamInvitation).toHaveBeenCalledOnce();
    } finally {
      sending.resolve();
      await Promise.all(workers.map((worker) => worker.stop()));
    }
  });

  it('refuses a second attempt while the first still holds the invitation', async () => {
    const invitation = await seedInvitation();
    const deliveryId = await seedDelivery(invitation);
    const sending = deferred();
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockReturnValueOnce(sending.promise)
      .mockResolvedValue(undefined);
    const handler = handlerWith(mailerThat(sendTeamInvitation));

    const first = handler([jobFor(deliveryId, 0)]);
    await vi.waitFor(() => expect(sendTeamInvitation).toHaveBeenCalledOnce());

    // The expiry of the first attempt would make pg-boss hand the job to a
    // second worker while the first is still inside its SMTP call.
    await expect(handler([jobFor(deliveryId, 1)])).rejects.toThrow(
      'delivery still in progress from an earlier attempt',
    );
    expect(sendTeamInvitation).toHaveBeenCalledOnce();

    sending.resolve();
    await expect(first).resolves.toBeUndefined();
    expect(await deliveryState(deliveryId)).toMatchObject({
      sent_at: expect.any(Date),
    });
  });

  it('refuses and audits cancellation after delivery has begun', async () => {
    const invitation = await seedInvitation();
    const deliveryId = await seedDelivery(invitation);
    const sending = deferred();
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockReturnValue(sending.promise);
    const handler = handlerWith(mailerThat(sendTeamInvitation));

    const delivering = handler([jobFor(deliveryId, 0)]);
    await vi.waitFor(() => expect(sendTeamInvitation).toHaveBeenCalledOnce());
    await expect(
      cancelTeamInvitation(
        {
          tenantDb: createTenantDb(scratch.app, TEAM_ID),
          principal: PRINCIPAL,
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
    // The refusal is a decision the team can see, so it is audited like any
    // other — and committed even though the command changed nothing.
    expect(
      await scratch.pool.query(
        `SELECT event_type, outcome, subject_id, subject_label, details
         FROM audit_events
         WHERE team_id = $1 AND subject_id = $2`,
        [TEAM_ID, invitation.invitationId],
      ),
    ).toHaveProperty('rows', [
      {
        event_type: 'team.invitation.cancellation_failed',
        outcome: 'failed',
        subject_id: invitation.invitationId,
        subject_label: invitation.email,
        details: { failureCode: 'delivery_in_progress' },
      },
    ]);

    sending.resolve();
    await expect(delivering).resolves.toBeUndefined();
    expect(await deliveryState(deliveryId)).toMatchObject({
      sent_at: expect.any(Date),
    });
  });

  it('lets cancellation win the invitation lock and suppresses what follows', async () => {
    const invitation = await seedInvitation();
    const deliveryId = await seedDelivery(invitation);
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);
    const handler = handlerWith(mailerThat(sendTeamInvitation));

    await createTenantDb(scratch.app, TEAM_ID).transaction(async (client) => {
      await client.query(
        `SELECT id FROM team_invitations
         WHERE team_id = $1 AND id = $2
         FOR UPDATE`,
        [TEAM_ID, invitation.invitationId],
      );
      // A cancellation holding the row is indistinguishable from another
      // attempt holding it: the handler gives up rather than sending mail for
      // an invitation someone is in the middle of withdrawing.
      await expect(handler([jobFor(deliveryId, 0)])).rejects.toThrow(
        'delivery still in progress from an earlier attempt',
      );
      await client.query(
        `UPDATE team_invitations SET status = 'canceled'
         WHERE team_id = $1 AND id = $2`,
        [TEAM_ID, invitation.invitationId],
      );
    });

    await expect(handler([jobFor(deliveryId, 1)])).resolves.toBeUndefined();
    expect(sendTeamInvitation).not.toHaveBeenCalled();
    expect(await deliveryState(deliveryId)).toMatchObject({
      suppressed_at: expect.any(Date),
    });
  });

  it('allows application commands to enqueue but not alter delivery state', async () => {
    const invitation = await seedInvitation();
    await seedDelivery(invitation);

    // The job half of the same rule — that the application role can create a
    // job and neither read nor alter one — is proven in
    // src/jobs/__tests__/grants.test.ts.
    await expect(
      scratch.app.query(
        `UPDATE team_invitation_deliveries SET sent_at = CURRENT_TIMESTAMP`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('lets maintenance advance delivery state without rewriting its payload', async () => {
    const invitation = await seedInvitation();
    const deliveryId = await seedDelivery(invitation);

    await expect(
      scratch.maintenance.query(
        `UPDATE team_invitation_deliveries
         SET attempt_count = attempt_count + 1
         WHERE id = $1`,
        [deliveryId],
      ),
    ).resolves.toHaveProperty('rowCount', 1);
    await expect(
      scratch.maintenance.query(
        `UPDATE team_invitation_deliveries
         SET email = 'rewritten@example.com'
         WHERE id = $1`,
        [deliveryId],
      ),
    ).rejects.toThrow('invitation delivery payload is immutable');
  });

  it('structurally rejects an outbox row assigned to another team', async () => {
    const invitation = await seedInvitation();

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

  it('sends a queued invitation end to end', async () => {
    const sendTeamInvitation = vi
      .fn<InvitationMailer['sendTeamInvitation']>()
      .mockResolvedValue(undefined);
    await drainQueue();
    const worker = scratch.createJobWorker();
    await worker.start();
    try {
      await registerInvitationDelivery(worker.boss, {
        maintenancePool: scratch.maintenance,
        mailer: mailerThat(sendTeamInvitation),
        publicBaseUrl: PUBLIC_BASE_URL,
      });

      const email = `${randomUUID()}@example.com`;
      const created = await createTeamInvitation(
        {
          tenantDb: createTenantDb(scratch.app, TEAM_ID),
          principal: PRINCIPAL,
          requestId: randomUUID(),
          jobs,
        },
        { email, role: 'member' },
      );

      await vi.waitFor(
        async () => {
          const sent = await scratch.pool.query<{ sent_at: Date | null }>(
            `SELECT sent_at FROM team_invitation_deliveries
             WHERE invitation_id = $1`,
            [created.invitationId],
          );
          expect(sent.rows[0]?.sent_at).toBeInstanceOf(Date);
        },
        { timeout: WORKED_JOB_TIMEOUT_MS, interval: 100 },
      );
      expect(sendTeamInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          invitationUrl: `${PUBLIC_BASE_URL}/invitations/${created.invitationId}`,
          role: 'member',
        }),
      );
    } finally {
      await worker.stop();
    }
  });
});
