import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
    locale: null,
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
  // A system actor is the one kind the audit_events actor_id CHECK lets carry
  // no id, and no producer in this build can append one — so the read paths
  // are only exercised against one by seeding the row directly.
  actorKind?: 'user' | 'api_token' | 'system';
  actorId: string | null;
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
       $1, $2, $2, $3, $4::timestamptz, $5, $6, $7, $8, $19, $9, $10,
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
      event.actorKind ?? 'user',
    ],
  );
  return id;
}

/**
 * The application pool with a client budget, so a chosen transaction fails at
 * the first thing an audited append does: acquire a client. An audit read
 * spends one budgeted client on the transaction that decides authorization,
 * which leaves the denial append — the next transaction the request opens —
 * with nothing.
 */
function poolWithClientBudget(
  pool: pg.Pool,
  budget: number,
  message: string,
): pg.Pool {
  let remaining = budget;
  return new Proxy(pool, {
    get(target, property, receiver) {
      if (property === 'connect') {
        return () => {
          if (remaining <= 0) return Promise.reject(new Error(message));
          remaining -= 1;
          return target.connect();
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** The structured `detail` of a `process.emitWarning` call, parsed. */
function warningDetail(options: string | object | undefined): unknown {
  if (typeof options !== 'object' || options === null) {
    throw new Error('expected structured audit warning options');
  }
  const detail = Reflect.get(options, 'detail');
  if (typeof detail !== 'string') {
    throw new Error('expected structured audit warning detail');
  }
  return JSON.parse(detail);
}

/** The next free per-team sequence, so a direct seed cannot collide. */
async function nextSequence(pool: pg.Pool, teamId: string): Promise<number> {
  const rows = await pool.query<{ next: string }>(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next
     FROM audit_events WHERE team_id = $1`,
    [teamId],
  );
  return Number(rows.rows[0]?.next ?? 1);
}

describe.skipIf(!db)('audit list/get RPC', () => {
  let pool: pg.Pool;
  let appPool: pg.Pool;
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
    appPool = scratch.app;
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
    // audit.list/get re-read the caller's membership row inside the read's own
    // transaction, so the stubbed AuthService role needs a matching domain row.
    for (const [seat, role] of [
      [OWNER, 'owner'],
      [ADMIN, 'admin'],
      [MEMBER, 'member'],
    ] as const) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [seat.userId, seat.name, seat.email],
      );
      await pool.query(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [`${seat.userId}-member`, TEAM, seat.userId, role],
      );
    }
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
        pool: appPool,
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
      actor: { kind: 'user', id: ADMIN.userId },
    });
    expect(byActor.items.map((item) => item.sequence)).toEqual(['4', '3']);

    const fromLater = await client.audit.list({
      teamId: TEAM,
      from: new Date(T1),
    });
    expect(fromLater.items.map((item) => item.sequence)).toEqual(['7', '6']);

    // `to` is exclusive, so the bound that selects everything at T0 is the
    // start of the next period — the convention AuditListInputSchema
    // documents, because `occurred_at` has microsecond resolution and no
    // millisecond-precision `Date` can name a period's true last instant.
    const toEarlier = await client.audit.list({
      teamId: TEAM,
      to: new Date(T1),
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

  // A system actor is the only actor the schema lets carry no id, so before
  // this filter existed there was no way to ask for its rows at all: the
  // actor filter was typed `actorId: string`, and `actor_id = NULL` would
  // match nothing under three-valued logic even if a null reached the query.
  it('filters for a system actor that carries no id', async () => {
    // Not a literal: the denial tests above append through the real store, so
    // the seeded 1–7 are already followed by audit.read_denied rows and a
    // hard-coded sequence collides with the per-team unique index.
    const systemSequence = await nextSequence(pool, TEAM);
    await insertEvent(pool, TEAM, {
      sequence: systemSequence,
      occurredAt: T2,
      eventType: 'audit.system_retention',
      eventVersion: 1,
      category: 'audit',
      outcome: 'succeeded',
      actorKind: 'system',
      actorId: null,
      actorLabel: 'Studio',
      details: {},
    });

    const systemOnly = await client.audit.list({
      teamId: TEAM,
      actor: { kind: 'system', id: null },
    });
    expect(systemOnly.items.map((item) => item.sequence)).toEqual([
      String(systemSequence),
    ]);
    expect(systemOnly.items[0]?.actor).toEqual({
      kind: 'system',
      id: null,
      label: 'Studio',
    });

    // The pair is the identity: the same kind with an id it does not have
    // matches nothing, and a user filter never picks the system row up.
    const wrongPair = await client.audit.list({
      teamId: TEAM,
      actor: { kind: 'user', id: OWNER.userId },
    });
    expect(wrongPair.items.map((item) => item.sequence)).not.toContain(
      String(systemSequence),
    );
  });

  it('does not leak another team through get or list', async () => {
    const crossTeam = await safe(
      client.audit.get({ teamId: TEAM, eventId: otherTeamEventId }),
    );
    expect(crossTeam.error).toMatchObject({ code: 'NOT_FOUND' });

    const otherList = await safe(client.audit.list({ teamId: OTHER_TEAM }));
    expect(otherList.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  // The activity screen's filters must offer values from the team's whole
  // history. With the option list built from loaded pages, an action or actor
  // that only appears past the first page was unreachable without paging
  // through everything in between.
  //
  // Reads the system-actor row seeded above, like the paging test reads the
  // row the cursor test inserts: this suite seeds forward through one shared
  // team, in declaration order.
  it('offers filter values from beyond the first loaded page', async () => {
    const firstPage = await client.audit.list({ teamId: TEAM, limit: 2 });
    expect(firstPage.items.map((item) => item.eventType)).not.toContain(
      'team.member.role_changed',
    );

    const options = await client.audit.filterOptions({ teamId: TEAM });
    expect(options.actions).toContainEqual({
      eventType: 'team.member.role_changed',
      title: 'Member role changed',
    });
    // An event type this build does not register keeps its machine name, the
    // same fallback the feed row itself uses.
    expect(options.actions).toContainEqual({
      eventType: 'audit.future_event',
      title: 'audit.future_event',
    });
    expect(options.actors).toContainEqual({
      kind: 'user',
      id: 'future-actor',
      label: 'Future Actor',
    });
    expect(options.actors).toContainEqual({
      kind: 'system',
      id: null,
      label: 'Studio',
    });
    expect(options.truncated).toBe(false);
  });

  it('denies filter options to members, naming the procedure in the event', async () => {
    currentPrincipal = MEMBER;
    const denied = await safe(client.audit.filterOptions({ teamId: TEAM }));
    expect(denied.error).toMatchObject({ code: 'FORBIDDEN' });

    const denials = await pool.query<{ details: { procedure: string } }>(
      `SELECT details FROM audit_events
       WHERE team_id = $1 AND event_type = 'audit.read_denied'
         AND actor_id = $2 AND details->>'procedure' = 'audit.filterOptions'`,
      [TEAM, MEMBER.userId],
    );
    expect(denials.rowCount).toBe(1);
    currentPrincipal = OWNER;
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

  it('rejects a cursor outside the PostgreSQL bigint range', async () => {
    currentPrincipal = OWNER;
    // All digits, so the shape check alone admits it, but the list query casts
    // the cursor with `::bigint`. Unbounded, this reaches Postgres and raises
    // numeric_value_out_of_range (SQLSTATE 22003), surfacing as a 500 rather
    // than a rejected input.
    const overRange = await safe(
      client.audit.list({ teamId: TEAM, cursor: '99999999999999999999' }),
    );
    expect(overRange.error).toMatchObject({ code: 'BAD_REQUEST' });

    // One past bigint's maximum, at the same digit count as the maximum.
    const justOverMax = await safe(
      client.audit.list({ teamId: TEAM, cursor: '9223372036854775808' }),
    );
    expect(justOverMax.error).toMatchObject({ code: 'BAD_REQUEST' });

    // The maximum itself stays a valid cursor: it is a representable sequence.
    const atMax = await safe(
      client.audit.list({ teamId: TEAM, cursor: '9223372036854775807' }),
    );
    expect(atMax.error).toBeNull();
  });

  it('re-authorizes the caller role inside the read transaction', async () => {
    // requireTeam reads the caller's membership before the read transaction
    // opens. A demotion committing in that window must not be outrun by the
    // cached role: the read re-reads and locks the actor's membership row, so
    // it serializes behind the role change and sees the committed role.
    const demoted = principal('audit-demoted-user', 'Audit Demoted');
    const memberId = 'audit-demoted-member';
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [demoted.userId, demoted.name, demoted.email],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')`,
      [memberId, TEAM, demoted.userId],
    );

    let reportMiddlewareAuthorization: () => void = () => undefined;
    const middlewareAuthorized = new Promise<void>((resolve) => {
      reportMiddlewareAuthorization = resolve;
    });
    const demotedClient = createRpcClient(
      createApp(readEnv(), {
        invitationDeliveryAvailable: true,
        pool: appPool,
        auth: stubAuthService({
          getSession: () => Promise.resolve(demoted),
          // Still owner: this is the stale read the request carries forward.
          getMembership: () => {
            reportMiddlewareAuthorization();
            return Promise.resolve({ role: 'owner' });
          },
        }),
      }),
    );

    const holder = await pool.connect();
    try {
      // Hold the membership row so the demotion is guaranteed to be in flight
      // while the request is past requireTeam but before it reads any rows.
      await holder.query('BEGIN');
      await holder.query(
        `SELECT 1 FROM team_members WHERE id = $1 FOR UPDATE`,
        [memberId],
      );

      const request = safe(demotedClient.audit.list({ teamId: TEAM }));
      await middlewareAuthorized;
      await holder.query(
        `UPDATE team_members SET role = 'member' WHERE id = $1`,
        [memberId],
      );
      await holder.query('COMMIT');

      const { error, data } = await request;
      expect(error).toMatchObject({ code: 'FORBIDDEN' });
      expect(data).toBeUndefined();
    } catch (error) {
      await holder.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      holder.release();
    }

    // The denial is audited like any other audit.read refusal.
    expect(
      await pool.query(
        `SELECT id FROM audit_events
         WHERE team_id = $1 AND actor_id = $2
           AND event_type = 'audit.read_denied'`,
        [TEAM, demoted.userId],
      ),
    ).toHaveProperty('rowCount', 1);
  });

  it('re-reads a promotion committed after the middleware read the role', async () => {
    // The mirror of the demotion above: requireTeam's role is stale in both
    // directions, so a negative one cannot decide either. A promotion
    // committing in that window must be answered with the audit data the
    // committed role grants — and must not leave an audit.read_denied event
    // in an immutable log for a refusal that never happened.
    const promoted = principal('audit-promoted-user', 'Audit Promoted');
    const memberId = 'audit-promoted-member';
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [promoted.userId, promoted.name, promoted.email],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'member')`,
      [memberId, TEAM, promoted.userId],
    );

    let reportMiddlewareAuthorization: () => void = () => undefined;
    const middlewareAuthorized = new Promise<void>((resolve) => {
      reportMiddlewareAuthorization = resolve;
    });
    const promotedClient = createRpcClient(
      createApp(readEnv(), {
        invitationDeliveryAvailable: true,
        pool: appPool,
        auth: stubAuthService({
          getSession: () => Promise.resolve(promoted),
          // Still member: this is the stale read the request carries forward.
          getMembership: () => {
            reportMiddlewareAuthorization();
            return Promise.resolve({ role: 'member' });
          },
        }),
      }),
    );

    const holder = await pool.connect();
    try {
      // Hold the membership row so the promotion is guaranteed to be in
      // flight while the request is past requireTeam but before it authorizes.
      await holder.query('BEGIN');
      await holder.query(
        `SELECT 1 FROM team_members WHERE id = $1 FOR UPDATE`,
        [memberId],
      );

      const request = safe(promotedClient.audit.list({ teamId: TEAM }));
      await middlewareAuthorized;
      await holder.query(
        `UPDATE team_members SET role = 'owner' WHERE id = $1`,
        [memberId],
      );
      await holder.query('COMMIT');

      const { error, data } = await request;
      expect(error).toBeNull();
      expect(data?.items.length).toBeGreaterThan(0);
    } catch (error) {
      await holder.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      holder.release();
    }

    expect(
      await pool.query(
        `SELECT id FROM audit_events
         WHERE team_id = $1 AND actor_id = $2
           AND event_type = 'audit.read_denied'`,
        [TEAM, promoted.userId],
      ),
    ).toHaveProperty('rowCount', 0);
  });

  it('signals when a denial event is lost before it can be appended', async () => {
    // Access stays denied whether or not the denial event lands, so the only
    // way an operator learns a required audit event was lost is a warning.
    // Only the insert itself emits one from audit/command.ts; everything the
    // append does before it — acquiring a client, beginning the transaction,
    // locking the team, reading the team row — has to be covered here.
    const unrecorded = principal('audit-lost-denial-user', 'Audit Lost');
    const memberId = 'audit-lost-denial-member';
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [unrecorded.userId, unrecorded.name, unrecorded.email],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'member')`,
      [memberId, TEAM, unrecorded.userId],
    );

    const warning = vi
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => undefined);
    const unrecordedClient = createRpcClient(
      createApp(readEnv(), {
        invitationDeliveryAvailable: true,
        // One client for the transaction that decides the denial; the append
        // that must record it then cannot acquire one.
        pool: poolWithClientBudget(appPool, 1, 'test client budget exhausted'),
        auth: stubAuthService({
          getSession: () => Promise.resolve(unrecorded),
          getMembership: () => Promise.resolve({ role: 'member' }),
        }),
      }),
    );

    let calls: (typeof warning)['mock']['calls'];
    try {
      const denied = await safe(unrecordedClient.audit.list({ teamId: TEAM }));
      expect(denied.error).toMatchObject({ code: 'FORBIDDEN' });
      calls = [...warning.mock.calls];
    } finally {
      warning.mockRestore();
    }

    const lost = calls.filter(
      ([, options]) =>
        typeof options === 'object' &&
        options !== null &&
        Reflect.get(options, 'code') === 'STUDIO_AUDIT_DENIAL_EVENT_LOST',
    );
    expect(lost).toHaveLength(1);
    expect(lost[0]?.[0]).toBe(
      'Required audit.read_denied event was not recorded; the read stayed denied.',
    );
    expect(warningDetail(lost[0]?.[1])).toEqual({
      eventType: 'audit.read_denied',
      procedure: 'audit.list',
      teamId: TEAM,
      actorId: unrecorded.userId,
      requestId: expect.any(String),
      causeName: 'Error',
      causeMessage: 'test client budget exhausted',
    });

    // The signal exists precisely because nothing was recorded.
    expect(
      await pool.query(
        `SELECT id FROM audit_events WHERE team_id = $1 AND actor_id = $2`,
        [TEAM, unrecorded.userId],
      ),
    ).toHaveProperty('rowCount', 0);
  });
});
