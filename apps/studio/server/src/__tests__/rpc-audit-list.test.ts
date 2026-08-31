import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const db = await reachableDb();

const TEAM = 'audit-list-team';
const OTHER_TEAM = 'audit-list-other';
const T0 = '2026-08-30T10:00:00.000Z';
const T1 = '2026-08-30T11:00:00.000Z';
const T2 = '2026-08-30T12:00:00.000Z';

function principal(userId: string, name: string): SessionPrincipal {
  return {
    kind: 'user',
    userId,
    email: `${userId}@example.com`,
    emailVerified: true,
    name,
    sessionId: `${userId}-session`,
  };
}

const OWNER = principal('audit-owner-user', 'Audit Owner');
const ADMIN = principal('audit-admin-user', 'Audit Admin');
const MEMBER = principal('audit-member-user', 'Audit Member');

type SeededEvent = {
  sequence: number;
  occurredAt: string;
  eventType: string;
  eventVersion: number;
  category: string;
  outcome: string;
  actorId: string;
  actorLabel: string;
  subject?: { type: string; id: string; label: string };
  resource?: { type: string; id: string; label: string };
  details: Record<string, unknown>;
};

async function insertEvent(
  pool: pg.Pool,
  teamId: string,
  event: SeededEvent,
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO audit_events (
       id, team_id, team_label, sequence, occurred_at, event_type,
       event_version, category, outcome, actor_kind, actor_id, actor_label,
       subject_type, subject_id, subject_label,
       resource_type, resource_id, resource_label, request_id, details
     ) VALUES (
       $1, $2, $2, $3, $4::timestamptz, $5, $6, $7, $8, 'user', $9, $10,
       $11, $12, $13, $14, $15, $16, $17::uuid, $18::jsonb
     )`,
    [
      id,
      teamId,
      event.sequence,
      event.occurredAt,
      event.eventType,
      event.eventVersion,
      event.category,
      event.outcome,
      event.actorId,
      event.actorLabel,
      event.subject?.type ?? null,
      event.subject?.id ?? null,
      event.subject?.label ?? null,
      event.resource?.type ?? null,
      event.resource?.id ?? null,
      event.resource?.label ?? null,
      randomUUID(),
      JSON.stringify(event.details),
    ],
  );
  return id;
}

describe.skipIf(!db)('audit list/get RPC', () => {
  let pool: pg.Pool;
  let dispose: () => Promise<void>;
  let currentPrincipal: SessionPrincipal;
  let memberships: Record<string, string | undefined>;
  let client: ReturnType<typeof createRpcClient>;
  let eventIds: Record<number, string>;
  let otherTeamEventId: string;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    pool = scratch.pool;
    dispose = scratch.dispose;
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM);
    await seedTeam(pool, OTHER_TEAM);

    currentPrincipal = OWNER;
    memberships = {
      [OWNER.userId]: 'owner',
      [ADMIN.userId]: 'admin',
      [MEMBER.userId]: 'member',
    };
    const auth = stubAuthService({
      getSession: () => Promise.resolve(currentPrincipal),
      getMembership: (userId, teamId) => {
        const role = teamId === TEAM ? memberships[userId] : undefined;
        return Promise.resolve(role ? { role } : null);
      },
    });
    client = createRpcClient(
      createApp(readEnv(), {
        auth,
        invitationDeliveryAvailable: true,
        pool: scratch.app,
      }),
    );

    // Deterministic seeds: sequences 1–5 share one wall-clock timestamp so
    // ordering can only come from the sequence; 6 is a future
    // (event_type, event_version) pair this build does not register.
    const seeds: SeededEvent[] = [
      {
        sequence: 1,
        occurredAt: T0,
        eventType: 'team.member.role_changed',
        eventVersion: 1,
        category: 'team_access',
        outcome: 'succeeded',
        actorId: OWNER.userId,
        actorLabel: 'Audit Owner',
        subject: { type: 'team_member', id: 'member-1', label: 'Member One' },
        details: { previousRoles: ['member'], newRoles: ['admin'] },
      },
      {
        sequence: 2,
        occurredAt: T0,
        eventType: 'team.invitation.created',
        eventVersion: 1,
        category: 'team_access',
        outcome: 'succeeded',
        actorId: OWNER.userId,
        actorLabel: 'Audit Owner',
        subject: {
          type: 'team_invitation',
          id: 'invitation-1',
          label: 'invitee@example.com',
        },
        details: { role: 'member' },
      },
      {
        sequence: 3,
        occurredAt: T0,
        eventType: 'protocol.created',
        eventVersion: 1,
        category: 'protocol',
        outcome: 'succeeded',
        actorId: ADMIN.userId,
        actorLabel: 'Audit Admin',
        resource: { type: 'protocol', id: 'protocol-1', label: 'Protocol One' },
        details: { draftId: 'draft-1' },
      },
      {
        sequence: 4,
        occurredAt: T0,
        eventType: 'team.member.role_change_denied',
        eventVersion: 1,
        category: 'team_access',
        outcome: 'denied',
        actorId: ADMIN.userId,
        actorLabel: 'Audit Admin',
        subject: { type: 'team_member', id: 'member-1', label: 'Member One' },
        details: {
          requestedRoles: ['owner'],
          reason: 'owner_role_requires_owner',
        },
      },
      {
        sequence: 5,
        occurredAt: T0,
        eventType: 'team.invitation.cancelled',
        eventVersion: 2,
        category: 'team_access',
        outcome: 'succeeded',
        actorId: OWNER.userId,
        actorLabel: 'Audit Owner',
        subject: {
          type: 'team_invitation',
          id: 'invitation-1',
          label: 'invitee@example.com',
        },
        details: { roles: ['admin', 'member'] },
      },
      {
        sequence: 6,
        occurredAt: T1,
        eventType: 'audit.future_event',
        eventVersion: 7,
        category: 'audit',
        outcome: 'succeeded',
        actorId: 'future-actor',
        actorLabel: 'Future Actor',
        details: { mystery: true },
      },
    ];
    eventIds = {};
    for (const seed of seeds) {
      eventIds[seed.sequence] = await insertEvent(pool, TEAM, seed);
    }
    otherTeamEventId = await insertEvent(pool, OTHER_TEAM, {
      sequence: 1,
      occurredAt: T0,
      eventType: 'team.invitation.created',
      eventVersion: 1,
      category: 'team_access',
      outcome: 'succeeded',
      actorId: 'other-owner',
      actorLabel: 'Other Owner',
      subject: {
        type: 'team_invitation',
        id: 'invitation-2',
        label: 'other@example.com',
      },
      details: { role: 'member' },
    });
  });

  afterAll(async () => {
    await dispose();
  });

  it('lists newest-first with registry titles and a generic unknown-pair row', async () => {
    const page = await client.audit.list({ teamId: TEAM });
    expect(page.items.map((item) => item.sequence)).toEqual([
      '6',
      '5',
      '4',
      '3',
      '2',
      '1',
    ]);
    expect(page.nextCursor).toBeNull();

    const future = page.items[0];
    expect(future).toMatchObject({
      eventType: 'audit.future_event',
      eventVersion: 7,
      title: 'audit.future_event',
      rendered: false,
      outcome: 'succeeded',
    });

    const cancelled = page.items[1];
    expect(cancelled).toMatchObject({
      title: 'Invitation cancelled',
      rendered: true,
      eventVersion: 2,
      actor: { kind: 'user', id: OWNER.userId, label: 'Audit Owner' },
      subject: {
        type: 'team_invitation',
        id: 'invitation-1',
        label: 'invitee@example.com',
      },
      resource: null,
    });
    expect(page.items[5]?.title).toBe('Member role changed');
    expect(page.items[5]?.occurredAt.toISOString()).toBe(T0);
  });

  it('pages by sequence cursor without duplicating or dropping rows', async () => {
    const first = await client.audit.list({ teamId: TEAM, limit: 2 });
    expect(first.items.map((item) => item.sequence)).toEqual(['6', '5']);
    expect(first.nextCursor).toBe('5');

    // A concurrent insert between pages must not shift the already-cursored
    // window.
    eventIds[7] = await insertEvent(pool, TEAM, {
      sequence: 7,
      occurredAt: T2,
      eventType: 'team.invitation.created',
      eventVersion: 1,
      category: 'team_access',
      outcome: 'succeeded',
      actorId: OWNER.userId,
      actorLabel: 'Audit Owner',
      subject: {
        type: 'team_invitation',
        id: 'invitation-3',
        label: 'late@example.com',
      },
      details: { role: 'member' },
    });

    const second = await client.audit.list({
      teamId: TEAM,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((item) => item.sequence)).toEqual(['4', '3']);
    const third = await client.audit.list({
      teamId: TEAM,
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(third.items.map((item) => item.sequence)).toEqual(['2', '1']);
    // A full final page still reports a cursor; the follow-up page is empty.
    expect(third.nextCursor).toBe('1');
    const fourth = await client.audit.list({
      teamId: TEAM,
      limit: 2,
      cursor: third.nextCursor ?? undefined,
    });
    expect(fourth.items).toEqual([]);
    expect(fourth.nextCursor).toBeNull();
  });

  it('filters by category, action, actor, outcome, and date range', async () => {
    const byCategory = await client.audit.list({
      teamId: TEAM,
      categories: ['protocol'],
    });
    expect(byCategory.items.map((item) => item.sequence)).toEqual(['3']);

    const byOutcome = await client.audit.list({
      teamId: TEAM,
      outcomes: ['denied'],
    });
    expect(byOutcome.items.map((item) => item.sequence)).toEqual(['4']);

    const byType = await client.audit.list({
      teamId: TEAM,
      eventTypes: ['team.invitation.created'],
    });
    expect(byType.items.map((item) => item.sequence)).toEqual(['7', '2']);

    const byActor = await client.audit.list({
      teamId: TEAM,
      actorId: ADMIN.userId,
    });
    expect(byActor.items.map((item) => item.sequence)).toEqual(['4', '3']);

    const fromLater = await client.audit.list({
      teamId: TEAM,
      from: new Date(T1),
    });
    expect(fromLater.items.map((item) => item.sequence)).toEqual(['7', '6']);

    const toEarlier = await client.audit.list({
      teamId: TEAM,
      to: new Date(T0),
    });
    expect(toEarlier.items.map((item) => item.sequence)).toEqual([
      '5',
      '4',
      '3',
      '2',
      '1',
    ]);

    const combined = await client.audit.list({
      teamId: TEAM,
      categories: ['team_access'],
      outcomes: ['succeeded'],
    });
    expect(combined.items.map((item) => item.sequence)).toEqual([
      '7',
      '5',
      '2',
      '1',
    ]);
  });

  it('returns per-version filtered details for one event', async () => {
    const roleChange = await client.audit.get({
      teamId: TEAM,
      eventId: eventIds[1] ?? '',
    });
    expect(roleChange).toMatchObject({
      title: 'Member role changed',
      rendered: true,
      teamLabel: TEAM,
      details: { previousRoles: ['member'], newRoles: ['admin'] },
    });
    expect(roleChange.occurredAt.toISOString()).toBe(T0);
    expect(roleChange.requestId).toMatch(/^[0-9a-f-]{36}$/);

    const cancelledV2 = await client.audit.get({
      teamId: TEAM,
      eventId: eventIds[5] ?? '',
    });
    expect(cancelledV2.details).toEqual({ roles: ['admin', 'member'] });

    // Unknown pairs disclose nothing beyond the machine identity.
    const future = await client.audit.get({
      teamId: TEAM,
      eventId: eventIds[6] ?? '',
    });
    expect(future).toMatchObject({ rendered: false, details: {} });
  });

  it('works for admins and denies members with a committed denial event', async () => {
    currentPrincipal = ADMIN;
    await expect(client.audit.list({ teamId: TEAM })).resolves.toMatchObject({
      nextCursor: null,
    });

    currentPrincipal = MEMBER;
    const list = await safe(client.audit.list({ teamId: TEAM }));
    expect(list.error).toMatchObject({ code: 'FORBIDDEN' });
    const get = await safe(
      client.audit.get({ teamId: TEAM, eventId: eventIds[1] ?? '' }),
    );
    expect(get.error).toMatchObject({ code: 'FORBIDDEN' });

    const denials = await pool.query<{ details: { procedure: string } }>(
      `SELECT details FROM audit_events
       WHERE team_id = $1 AND event_type = 'audit.read_denied'
         AND actor_id = $2
       ORDER BY sequence`,
      [TEAM, MEMBER.userId],
    );
    expect(denials.rows.map((row) => row.details.procedure)).toEqual([
      'audit.list',
      'audit.get',
    ]);
    currentPrincipal = OWNER;
  });

  it('refuses non-members and unknown teams identically, with no event', async () => {
    currentPrincipal = principal('audit-outsider', 'Outsider');
    const known = await safe(client.audit.list({ teamId: TEAM }));
    expect(known.error).toMatchObject({ code: 'FORBIDDEN' });
    const unknown = await safe(client.audit.list({ teamId: 'unknown-team' }));
    expect(unknown.error).toMatchObject({ code: 'FORBIDDEN' });

    const rows = await pool.query(
      `SELECT 1 FROM audit_events WHERE actor_id = 'audit-outsider'
       UNION ALL
       SELECT 1 FROM audit_events WHERE team_id = 'unknown-team'`,
    );
    expect(rows.rowCount).toBe(0);
    currentPrincipal = OWNER;
  });

  it('does not leak another team through get or list', async () => {
    const crossTeam = await safe(
      client.audit.get({ teamId: TEAM, eventId: otherTeamEventId }),
    );
    expect(crossTeam.error).toMatchObject({ code: 'NOT_FOUND' });

    const otherList = await safe(client.audit.list({ teamId: OTHER_TEAM }));
    expect(otherList.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects invalid limits, cursors, filters, and event ids', async () => {
    const overLimit = await safe(
      client.audit.list({ teamId: TEAM, limit: 101 }),
    );
    expect(overLimit.error).toMatchObject({ code: 'BAD_REQUEST' });
    const badCursor = await safe(
      client.audit.list({ teamId: TEAM, cursor: 'not-a-sequence' }),
    );
    expect(badCursor.error).toMatchObject({ code: 'BAD_REQUEST' });
    const badId = await safe(
      client.audit.get({ teamId: TEAM, eventId: 'not-a-uuid' }),
    );
    expect(badId.error).toMatchObject({ code: 'BAD_REQUEST' });
  });
});
