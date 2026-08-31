import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTenantDb,
  type TenantDb,
  type TenantTransactionOptions,
} from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import {
  auditEventContext,
  type AuditedMutationResult,
  failedAuditEventContext,
  runAuditedCommand,
  runAuditedCommandWork,
  runAuditedMutation,
} from '../../audit/command.ts';
import type { AuditEventInput } from '../../audit/events.ts';
import { AUDIT_SEQUENCE_LOCK_SEED } from '../../audit/store.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import {
  cancelTeamInvitation,
  createTeamInvitation,
  TeamCommandError,
  updateTeamMemberRole,
} from '../commands.ts';

const compileTimeEmptyEventProof: AuditedMutationResult<void> = {
  result: undefined,
  // @ts-expect-error -- audited success requires a non-empty event tuple.
  events: [],
};
void compileTimeEmptyEventProof;

const db = await reachableDb();

type Identity = {
  userId: string;
  memberId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
};

function identity(
  teamId: string,
  label: string,
  role: Identity['role'],
): Identity {
  return {
    userId: `${teamId}-${label}-user`,
    memberId: `${teamId}-${label}-member`,
    email: `${teamId}-${label}@example.com`,
    name: `${label[0]!.toUpperCase()}${label.slice(1)} Person`,
    role,
  };
}

async function seedIdentity(
  pool: pg.Pool,
  teamId: string,
  person: Identity,
): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, $2, $3, true)`,
    [person.userId, person.name, person.email],
  );
  await pool.query(
    `INSERT INTO team_members (id, team_id, user_id, role)
     VALUES ($1, $2, $3, $4)`,
    [person.memberId, teamId, person.userId, person.role],
  );
}

function principal(person: Identity): SessionPrincipal {
  return {
    kind: 'user',
    userId: person.userId,
    email: person.email,
    emailVerified: true,
    name: person.name,
    sessionId: `${person.userId}-session`,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function signalTenantTransaction(
  tenantDb: TenantDb,
  signal: () => void,
): TenantDb {
  return {
    teamId: tenantDb.teamId,
    query: (text, values) => tenantDb.query(text, values),
    transaction: <T>(
      work: (client: pg.PoolClient) => Promise<T>,
      opts?: TenantTransactionOptions,
    ) =>
      tenantDb.transaction(async (client) => {
        signal();
        return work(client);
      }, opts),
  };
}

describe.skipIf(!db)('audited team commands', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
  });

  afterAll(async () => {
    await dispose();
  });

  it('changes a role with exact actor, target, before/after, and request context', async () => {
    const teamId = 'command-role-success';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    const member = identity(teamId, 'member', 'member');
    await seedIdentity(pool, teamId, owner);
    await seedIdentity(pool, teamId, member);
    const requestId = randomUUID();

    await expect(
      updateTeamMemberRole(
        {
          tenantDb: createTenantDb(app, teamId),
          principal: principal(owner),
          requestId,
        },
        { memberId: member.memberId, role: 'admin' },
      ),
    ).resolves.toEqual({ memberId: member.memberId, role: 'admin' });

    const changed = await pool.query<{ role: string }>(
      `SELECT role FROM team_members WHERE id = $1`,
      [member.memberId],
    );
    expect(changed.rows).toEqual([{ role: 'admin' }]);
    const event = await pool.query<{
      eventType: string;
      eventVersion: number;
      outcome: string;
      actorId: string;
      actorLabel: string;
      subjectId: string;
      subjectLabel: string;
      requestId: string;
      details: unknown;
    }>(
      `SELECT event_type AS "eventType", event_version AS "eventVersion",
              outcome, actor_id AS "actorId", actor_label AS "actorLabel",
              subject_id AS "subjectId", subject_label AS "subjectLabel",
              request_id AS "requestId", details
       FROM audit_events WHERE team_id = $1`,
      [teamId],
    );
    expect(event.rows).toEqual([
      {
        eventType: 'team.member.role_changed',
        eventVersion: 1,
        outcome: 'succeeded',
        actorId: owner.userId,
        actorLabel: owner.name,
        subjectId: member.memberId,
        subjectLabel: member.name,
        requestId,
        details: { previousRoles: ['member'], newRoles: ['admin'] },
      },
    ]);
  });

  it('snapshots the locked team label instead of joining a later rename', async () => {
    const teamId = 'command-team-label';
    await seedTeam(pool, teamId);
    await pool.query(
      `UPDATE teams SET name = 'Original Research Team' WHERE id = $1`,
      [teamId],
    );
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);

    await createTeamInvitation(
      {
        tenantDb: createTenantDb(app, teamId),
        principal: principal(owner),
        requestId: randomUUID(),
      },
      { email: 'team-label@example.com', role: 'member' },
    );
    await pool.query(
      `UPDATE teams SET name = 'Renamed Research Team' WHERE id = $1`,
      [teamId],
    );

    const event = await pool.query<{ teamLabel: string }>(
      `SELECT team_label AS "teamLabel" FROM audit_events WHERE team_id = $1`,
      [teamId],
    );
    expect(event.rows).toEqual([{ teamLabel: 'Original Research Team' }]);
  });

  it('rejects an empty event list even from an unsafe untyped caller', async () => {
    const teamId = 'command-empty-events';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    const unsafeEmpty = [] as unknown as readonly [
      AuditEventInput,
      ...AuditEventInput[],
    ];

    await expect(
      runAuditedMutation(
        {
          tenantDb: createTenantDb(app, teamId),
          principal: principal(owner),
          requestId: randomUUID(),
        },
        () => Promise.resolve({ result: undefined, events: unsafeEmpty }),
      ),
    ).rejects.toThrow('an audited command must produce at least one event');
  });

  it('takes the team audit lock before command work begins', async () => {
    const teamId = 'command-prework-lock';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    const context = {
      tenantDb: createTenantDb(app, teamId),
      principal: principal(owner),
      requestId: randomUUID(),
    };
    const workStarted = deferred();
    const releaseWork = deferred();
    const command = runAuditedMutation(
      context,
      async (_client, auditContext) => {
        workStarted.resolve();
        await releaseWork.promise;
        return {
          result: undefined,
          events: [
            {
              ...auditEventContext(auditContext),
              eventType: 'team.invitation.created',
              subjectType: 'team_invitation',
              subjectId: randomUUID(),
              subjectLabel: 'serialized@example.com',
              details: { role: 'member' },
            },
          ],
        };
      },
    );
    await workStarted.promise;
    try {
      const contender = await app.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtextextended($1, $2::bigint)) AS acquired`,
        [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
      );
      expect(contender.rows).toEqual([{ acquired: false }]);
    } finally {
      releaseWork.resolve();
    }
    await expect(command).resolves.toBeUndefined();
  });

  it('re-authorizes an actor after waiting for the team audit lock', async () => {
    const teamId = 'command-actor-revoked';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    const admin = identity(teamId, 'admin', 'admin');
    await seedIdentity(pool, teamId, owner);
    await seedIdentity(pool, teamId, admin);
    const holder = await pool.connect();
    const transactionStarted = deferred();
    try {
      await holder.query('BEGIN');
      await holder.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, $2::bigint))`,
        [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
      );
      await holder.query(
        `UPDATE team_members SET role = 'member' WHERE id = $1`,
        [admin.memberId],
      );

      const tenantDb = signalTenantTransaction(
        createTenantDb(app, teamId),
        transactionStarted.resolve,
      );
      const command = createTeamInvitation(
        {
          tenantDb,
          principal: principal(admin),
          requestId: randomUUID(),
        },
        { email: 'must-not-land@example.com', role: 'member' },
      );
      await transactionStarted.promise;
      await holder.query('COMMIT');

      await expect(command).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(
        await pool.query(`SELECT id FROM team_invitations WHERE team_id = $1`, [
          teamId,
        ]),
      ).toHaveProperty('rowCount', 0);
    } catch (error) {
      await holder.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      holder.release();
    }
  });

  it('rejects events whose trusted actor context differs from the command', async () => {
    const teamId = 'command-event-context';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    const context = {
      tenantDb: createTenantDb(app, teamId),
      principal: principal(owner),
      requestId: randomUUID(),
    };
    const baseEvent = {
      ...auditEventContext({ ...context, teamLabel: teamId }),
      eventType: 'team.invitation.created',
      subjectType: 'team_invitation',
      subjectId: randomUUID(),
      subjectLabel: 'context-check@example.com',
      details: { role: 'member' },
    } satisfies AuditEventInput;

    await expect(
      runAuditedMutation(context, () =>
        Promise.resolve({
          result: undefined,
          events: [{ ...baseEvent, actorLabel: 'Forged actor' }],
        }),
      ),
    ).rejects.toThrow('audit event context does not match its command');

    await expect(
      runAuditedMutation(context, () =>
        Promise.resolve({
          result: undefined,
          events: [{ ...baseEvent, teamLabel: 'Forged team' }],
        }),
      ),
    ).rejects.toThrow('audit event context does not match its command');

    const wrongKind = {
      ...baseEvent,
      actorKind: 'api_token',
    } as unknown as AuditEventInput;
    await expect(
      runAuditedMutation(context, () =>
        Promise.resolve({ result: undefined, events: [wrongKind] }),
      ),
    ).rejects.toThrow('audit event context does not match its command');

    expect(
      await pool.query(`SELECT id FROM audit_events WHERE team_id = $1`, [
        teamId,
      ]),
    ).toHaveProperty('rowCount', 0);
  });

  it('rejects events whose outcome differs from the command decision', async () => {
    const teamId = 'command-event-outcome';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    const context = {
      tenantDb: createTenantDb(app, teamId),
      principal: principal(owner),
      requestId: randomUUID(),
    };
    const succeededEvent = {
      ...auditEventContext({ ...context, teamLabel: teamId }),
      eventType: 'team.invitation.created',
      subjectType: 'team_invitation',
      subjectId: randomUUID(),
      subjectLabel: 'outcome-check@example.com',
      details: { role: 'member' },
    } satisfies AuditEventInput;

    const deniedEvent = {
      ...succeededEvent,
      outcome: 'denied',
    } as unknown as AuditEventInput;
    await expect(
      runAuditedMutation(context, () =>
        Promise.resolve({ result: undefined, events: [deniedEvent] }),
      ),
    ).rejects.toThrow(
      'audit event outcome does not match its command decision',
    );

    await expect(
      runAuditedCommand(context, () =>
        Promise.resolve({
          status: 'denied',
          error: new Error('denied'),
          events: [succeededEvent],
        }),
      ),
    ).rejects.toThrow(
      'audit event outcome does not match its command decision',
    );

    expect(
      await pool.query(`SELECT id FROM audit_events WHERE team_id = $1`, [
        teamId,
      ]),
    ).toHaveProperty('rowCount', 0);
  });

  it('preserves owner and manager authorization invariants', async () => {
    const teamId = 'command-role-rules';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    const admin = identity(teamId, 'admin', 'admin');
    const member = identity(teamId, 'member', 'member');
    const ordinaryMember = identity(teamId, 'ordinary', 'member');
    for (const person of [owner, admin, member, ordinaryMember]) {
      await seedIdentity(pool, teamId, person);
    }

    const adminContext = {
      tenantDb: createTenantDb(app, teamId),
      principal: principal(admin),
      requestId: randomUUID(),
    };
    await expect(
      updateTeamMemberRole(adminContext, {
        memberId: member.memberId,
        role: 'admin',
      }),
    ).resolves.toMatchObject({ role: 'admin' });
    await expect(
      updateTeamMemberRole(
        { ...adminContext, requestId: randomUUID() },
        { memberId: owner.memberId, role: 'member' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      updateTeamMemberRole(
        { ...adminContext, requestId: randomUUID() },
        { memberId: member.memberId, role: 'owner' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      createTeamInvitation(
        {
          tenantDb: createTenantDb(app, teamId),
          principal: principal(ordinaryMember),
          requestId: randomUUID(),
        },
        { email: 'forbidden@example.com', role: 'member' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('commits an immutable denial event before refusing role escalation', async () => {
    const teamId = 'command-role-denied';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    const admin = identity(teamId, 'admin', 'admin');
    const member = identity(teamId, 'member', 'member');
    for (const person of [owner, admin, member]) {
      await seedIdentity(pool, teamId, person);
    }
    const requestId = randomUUID();

    await expect(
      updateTeamMemberRole(
        {
          tenantDb: createTenantDb(app, teamId),
          principal: principal(admin),
          requestId,
        },
        { memberId: member.memberId, role: 'owner' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(
      await pool.query(`SELECT role FROM team_members WHERE id = $1`, [
        member.memberId,
      ]),
    ).toHaveProperty('rows', [{ role: 'member' }]);
    const denied = await pool.query<{
      id: string;
      outcome: string;
      eventType: string;
      actorId: string;
      subjectId: string;
      requestId: string;
      details: unknown;
    }>(
      `SELECT id, outcome, event_type AS "eventType", actor_id AS "actorId",
              subject_id AS "subjectId", request_id AS "requestId", details
       FROM audit_events WHERE team_id = $1`,
      [teamId],
    );
    expect(denied.rows).toEqual([
      {
        id: expect.any(String),
        outcome: 'denied',
        eventType: 'team.member.role_change_denied',
        actorId: admin.userId,
        subjectId: member.memberId,
        requestId,
        details: {
          requestedRoles: ['owner'],
          reason: 'owner_role_requires_owner',
        },
      },
    ]);
    await expect(
      pool.query(
        `UPDATE audit_events SET outcome = 'succeeded' WHERE id = $1`,
        [denied.rows[0]!.id],
      ),
    ).rejects.toThrow('audit events are immutable');
  });

  it('bounds repeated denied role-change events before starting another team transaction', async () => {
    const teamId = 'command-role-denied-rate-limit';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    const member = identity(teamId, 'member', 'member');
    await seedIdentity(pool, teamId, owner);
    await seedIdentity(pool, teamId, member);
    let transactionCount = 0;
    const tenantDb = signalTenantTransaction(
      createTenantDb(app, teamId),
      () => transactionCount++,
    );

    for (let attempt = 0; attempt < 6; attempt++) {
      await expect(
        updateTeamMemberRole(
          {
            tenantDb,
            principal: principal(member),
            requestId: randomUUID(),
          },
          { memberId: owner.memberId, role: 'member' },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }

    expect(transactionCount).toBe(5);
    expect(
      await pool.query(
        `SELECT id FROM audit_events
         WHERE team_id = $1
           AND event_type = 'team.member.role_change_denied'`,
        [teamId],
      ),
    ).toHaveProperty('rowCount', 5);
  });

  it('records a bounded failure for last-owner rejection without a false success event', async () => {
    const teamId = 'command-last-owner';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    const context = {
      tenantDb: createTenantDb(app, teamId),
      principal: principal(owner),
      requestId: randomUUID(),
    };

    await expect(
      updateTeamMemberRole(context, {
        memberId: owner.memberId,
        role: 'member',
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });
    await expect(
      updateTeamMemberRole(
        { ...context, requestId: randomUUID() },
        { memberId: owner.memberId, role: 'owner' },
      ),
    ).rejects.toMatchObject({ code: 'NO_CHANGE' });

    const positive = await createTeamInvitation(
      { ...context, requestId: randomUUID() },
      { email: 'positive-oracle@example.com', role: 'member' },
    );
    expect(positive.status).toBe('pending');
    const state = await pool.query<{ role: string }>(
      `SELECT role FROM team_members WHERE id = $1`,
      [owner.memberId],
    );
    expect(state.rows).toEqual([{ role: 'owner' }]);
    const events = await pool.query<{
      event_type: string;
      outcome: string;
      subject_id: string | null;
      details: unknown;
    }>(
      `SELECT event_type, outcome, subject_id, details
       FROM audit_events WHERE team_id = $1 ORDER BY sequence`,
      [teamId],
    );
    expect(events.rows).toEqual([
      {
        event_type: 'team.member.role_change_failed',
        outcome: 'failed',
        subject_id: null,
        details: { failureCode: 'last_owner' },
      },
      {
        event_type: 'team.invitation.created',
        outcome: 'succeeded',
        subject_id: positive.invitationId,
        details: { role: 'member' },
      },
    ]);
  });

  it('rolls classified domain mutations back to a savepoint before committing their failure event', async () => {
    const teamId = 'command-domain-savepoint';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    const context = {
      tenantDb: createTenantDb(app, teamId),
      principal: principal(owner),
      requestId: randomUUID(),
    };

    await expect(
      runAuditedCommand(context, async (client, auditContext) =>
        runAuditedCommandWork(
          client,
          async () => {
            await client.query(
              `UPDATE team_members SET role = 'member' WHERE id = $1`,
              [owner.memberId],
            );
            throw new TeamCommandError('LAST_OWNER');
          },
          (error) => {
            if (!(error instanceof TeamCommandError)) return null;
            const event = {
              ...failedAuditEventContext(auditContext),
              eventType: 'team.member.role_change_failed',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              details: { failureCode: 'last_owner' },
            } satisfies AuditEventInput;
            return { error, events: [event] };
          },
        ),
      ),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });

    expect(
      await pool.query(`SELECT role FROM team_members WHERE id = $1`, [
        owner.memberId,
      ]),
    ).toHaveProperty('rows', [{ role: 'owner' }]);
    expect(
      await pool.query(
        `SELECT event_type, outcome, details
         FROM audit_events WHERE team_id = $1`,
        [teamId],
      ),
    ).toHaveProperty('rows', [
      {
        event_type: 'team.member.role_change_failed',
        outcome: 'failed',
        details: { failureCode: 'last_owner' },
      },
    ]);
  });

  it('keeps one owner when two owners concurrently demote themselves', async () => {
    const teamId = 'command-concurrent-owners';
    await seedTeam(pool, teamId);
    const firstOwner = identity(teamId, 'first-owner', 'owner');
    const secondOwner = identity(teamId, 'second-owner', 'owner');
    await seedIdentity(pool, teamId, firstOwner);
    await seedIdentity(pool, teamId, secondOwner);

    const results = await Promise.allSettled(
      [firstOwner, secondOwner].map((owner) =>
        updateTeamMemberRole(
          {
            tenantDb: createTenantDb(app, teamId),
            principal: principal(owner),
            requestId: randomUUID(),
          },
          { memberId: owner.memberId, role: 'member' },
        ),
      ),
    );
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({ code: 'LAST_OWNER' });

    const memberships = await pool.query<{ role: string }>(
      `SELECT role FROM team_members WHERE team_id = $1 ORDER BY id`,
      [teamId],
    );
    expect(
      memberships.rows.filter(({ role }) => role === 'owner'),
    ).toHaveLength(1);
    expect(
      memberships.rows.filter(({ role }) => role === 'member'),
    ).toHaveLength(1);
    const events = await pool.query<{
      sequence: string;
      event_type: string;
      outcome: string;
      details: unknown;
    }>(
      `SELECT sequence::text, event_type, outcome, details
       FROM audit_events WHERE team_id = $1 ORDER BY sequence`,
      [teamId],
    );
    expect(events.rows).toEqual([
      {
        sequence: '1',
        event_type: 'team.member.role_changed',
        outcome: 'succeeded',
        details: { previousRoles: ['owner'], newRoles: ['member'] },
      },
      {
        sequence: '2',
        event_type: 'team.member.role_change_failed',
        outcome: 'failed',
        details: { failureCode: 'last_owner' },
      },
    ]);
  });

  it('creates and cancels an invitation without recording secret material', async () => {
    const teamId = 'command-invitations';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    const tenantDb = createTenantDb(app, teamId);

    const created = await createTeamInvitation(
      { tenantDb, principal: principal(owner), requestId: randomUUID() },
      { email: 'Invitee@Example.com', role: 'admin' },
    );
    expect(created).toMatchObject({
      email: 'invitee@example.com',
      role: 'admin',
      status: 'pending',
    });
    expect(created.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 47 * 60 * 60 * 1000,
    );
    expect(created.expiresAt.getTime()).toBeLessThan(
      Date.now() + 49 * 60 * 60 * 1000,
    );
    await expect(
      createTeamInvitation(
        { tenantDb, principal: principal(owner), requestId: randomUUID() },
        { email: 'invitee@example.com', role: 'member' },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      cancelTeamInvitation(
        { tenantDb, principal: principal(owner), requestId: randomUUID() },
        { invitationId: created.invitationId },
      ),
    ).resolves.toEqual({
      invitationId: created.invitationId,
      status: 'canceled',
    });
    const invitation = await pool.query<{ status: string }>(
      `SELECT status FROM team_invitations WHERE id = $1`,
      [created.invitationId],
    );
    expect(invitation.rows).toEqual([{ status: 'canceled' }]);
    const events = await pool.query<{
      event_type: string;
      subject_label: string;
      details: unknown;
    }>(
      `SELECT event_type, subject_label, details
       FROM audit_events WHERE team_id = $1 ORDER BY sequence`,
      [teamId],
    );
    expect(events.rows).toEqual([
      {
        event_type: 'team.invitation.created',
        subject_label: 'invitee@example.com',
        details: { role: 'admin' },
      },
      {
        event_type: 'team.invitation.cancelled',
        subject_label: 'invitee@example.com',
        details: { role: 'admin' },
      },
    ]);
    expect(JSON.stringify(events.rows)).not.toMatch(
      /token|magic|password|requestBody/i,
    );
  });

  it('rolls the member update back when the audit insert fails', async () => {
    const teamId = 'command-audit-failure';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    const member = identity(teamId, 'member', 'member');
    await seedIdentity(pool, teamId, owner);
    await seedIdentity(pool, teamId, member);
    await pool.query(`
      CREATE FUNCTION reject_test_audit_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'test audit insert rejected';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_test_audit_insert
        BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION reject_test_audit_insert();
    `);
    try {
      await expect(
        updateTeamMemberRole(
          {
            tenantDb: createTenantDb(app, teamId),
            principal: principal(owner),
            requestId: randomUUID(),
          },
          { memberId: member.memberId, role: 'admin' },
        ),
      ).rejects.toThrow('test audit insert rejected');
    } finally {
      await pool.query(`
        DROP TRIGGER reject_test_audit_insert ON audit_events;
        DROP FUNCTION reject_test_audit_insert();
      `);
    }

    const state = await pool.query<{ role: string }>(
      `SELECT role FROM team_members WHERE id = $1`,
      [member.memberId],
    );
    expect(state.rows).toEqual([{ role: 'member' }]);
    const events = await pool.query(
      `SELECT id FROM audit_events WHERE team_id = $1`,
      [teamId],
    );
    expect(events.rowCount).toBe(0);
  });

  it('retains history after mutable users, memberships, and invitations cascade', async () => {
    const teamId = 'command-retention';
    await seedTeam(pool, teamId);
    const owner = identity(teamId, 'owner', 'owner');
    await seedIdentity(pool, teamId, owner);
    await createTeamInvitation(
      {
        tenantDb: createTenantDb(app, teamId),
        principal: principal(owner),
        requestId: randomUUID(),
      },
      { email: 'retained@example.com', role: 'member' },
    );

    await pool.query(`DELETE FROM "user" WHERE id = $1`, [owner.userId]);
    expect(
      await pool.query(`SELECT id FROM team_members WHERE team_id = $1`, [
        teamId,
      ]),
    ).toHaveProperty('rowCount', 0);
    expect(
      await pool.query(`SELECT id FROM team_invitations WHERE team_id = $1`, [
        teamId,
      ]),
    ).toHaveProperty('rowCount', 0);
    expect(
      await pool.query(`SELECT id FROM audit_events WHERE team_id = $1`, [
        teamId,
      ]),
    ).toHaveProperty('rowCount', 1);
  });
});
