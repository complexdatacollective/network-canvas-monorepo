// A short, plausible activity history per team.
//
// The seed writes through `appendSeedAuditEvent` below rather than through
// `audit/store.ts`'s `append`, and this is the one place in the codebase where
// a second writer of the append-only log exists.
//
// It exists because the two run on different drivers. Stage 3 of #1927 moved
// the store onto `@effect/sql-pg`, while the seed stays on node-postgres and
// moves under `scripts/` — it runs its whole run inside one `pg` transaction,
// and an Effect transaction would be a *different connection*, so the events
// would not commit with the rows they describe.
//
// What stops the two drifting is not discipline but a test:
// `seed.test.ts` asserts this function names exactly the columns
// `AUDIT_TABLES.auditEvents` declares, so a column added to the table without
// being added here fails. It is the same answer `src/jobs/insert.ts` gives to
// the same problem on the enqueue path. Validation is still the store's:
// `parseAuditEventInput` runs here too, so the seed cannot write an event the
// registry would refuse.
//
// Two consequences follow, and both are load-bearing for the
// determinism test:
//
//   - `audit_events.id` comes from `randomUUID()` in the writer, which is
//     not reachable from the seed's PRNG. It is one of the two columns the
//     determinism case in `seed.test.ts` therefore leaves out of its dumps
//     (the other is better-auth's password hash, in `seed/teams.ts`);
//     everything else the seed writes is byte-identical between two runs.
//     `occurred_at` is passed in: each event is dated to the operation it
//     records, so the log agrees with the rows — a protocol created before
//     the versions that were published from it, a draft edit before the
//     version it produced, a colleague invited before they were promoted.
//   - `audit_export_jobs` and `audit_alert_outbox` are left empty. They have
//     no production writer yet — only tests insert into them — so seeding them
//     would mean inventing rows that bypass invariants no code has stated.
import { randomUUID } from 'node:crypto';

import { getTableName } from 'drizzle-orm';
import type pg from 'pg';

import {
  type AuditEventInput,
  parseAuditEventInput,
} from '../../audit/events.ts';
import { AUDIT_TABLES } from '../../audit/schema.ts';
import {
  AUDIT_SEQUENCE_LOCK_SEED,
  AUDIT_TEAM_LOCK_KEY_SQL,
} from '../../audit/store.ts';
import type { SeededProtocolLine } from './protocols.ts';
import { seedTime, seedUuid } from './rng.ts';
import type { SeedTeam } from './teams.ts';

/**
 * The columns the seed writes, in order. Exported so `seed.test.ts` can hold
 * them against the table's own declaration — the drift guard described above.
 * `occurred_at` is written explicitly because every seeded event is dated to
 * the operation it records.
 */
export const SEED_AUDIT_COLUMNS = [
  'id',
  'team_id',
  'team_label',
  'sequence',
  'event_type',
  'event_version',
  'category',
  'outcome',
  'actor_kind',
  'actor_id',
  'actor_label',
  'subject_type',
  'subject_id',
  'subject_label',
  'resource_type',
  'resource_id',
  'resource_label',
  'request_id',
  'details',
  'occurred_at',
] as const;

/**
 * One event, at the next sequence for its team, under the same advisory lock
 * the store takes — the lock is what makes the sequence gapless, and a seed
 * that skipped it would be the one writer that could tear the log.
 */
async function appendSeedAuditEvent(
  client: pg.PoolClient,
  unvalidatedEvent: AuditEventInput,
  options: { occurredAt: Date },
): Promise<void> {
  const event = parseAuditEventInput(unvalidatedEvent);
  await client.query(
    `SELECT pg_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL})`,
    [event.teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
  );
  const previous = await client.query<{ sequence: string }>(
    `SELECT COALESCE(MAX(sequence), 0)::text AS sequence
       FROM ${getTableName(AUDIT_TABLES.auditEvents)}
      WHERE team_id = $1`,
    [event.teamId],
  );
  const sequence = (BigInt(previous.rows[0]?.sequence ?? '0') + 1n).toString();
  await client.query(
    `INSERT INTO ${getTableName(AUDIT_TABLES.auditEvents)}
       (${SEED_AUDIT_COLUMNS.join(', ')})
     VALUES ($1, $2, $3, $4::bigint, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18::uuid, $19::jsonb, $20)`,
    [
      randomUUID(),
      event.teamId,
      event.teamLabel,
      sequence,
      event.eventType,
      event.eventVersion,
      event.category,
      event.outcome,
      event.actorKind,
      event.actorId,
      event.actorLabel,
      event.subjectType,
      event.subjectId,
      event.subjectLabel,
      event.resourceType,
      event.resourceId,
      event.resourceLabel,
      event.requestId,
      JSON.stringify(event.details),
      options.occurredAt,
    ],
  );
}

export async function seedAuditEvents(
  client: pg.PoolClient,
  team: SeedTeam,
  line: SeededProtocolLine,
): Promise<number> {
  const actor = {
    teamId: team.id,
    teamLabel: team.name,
    actorKind: 'user',
    actorId: team.adminUserId,
    actorLabel: 'Studio Admin',
  } as const;
  const teamAccess = {
    ...actor,
    eventVersion: 1,
    category: 'team_access',
    outcome: 'succeeded',
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
  } as const;
  const protocolContext = {
    ...actor,
    eventVersion: 1,
    category: 'protocol',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'protocol',
    resourceId: line.protocolId,
    resourceLabel: line.name,
  } as const;

  const sectionIds = Object.keys(line.versions[1].sectionHashes).slice(0, 3);
  const invited = team.members.filter(
    (member) => member.userId !== team.adminUserId,
  );

  // Each event with the moment of the operation it records; appended in
  // that order below, so the sequence reads as the timeline.
  const events: { occurredAt: Date; event: AuditEventInput }[] = [];
  const record = (occurredAt: Date, event: AuditEventInput) => {
    events.push({ occurredAt, event });
  };
  // The line's own dates (seed/protocols.ts): created 380 days before the
  // anchor, its second version published 340 days before, from the edit
  // committed the day before that.
  record(seedTime(-380), {
    ...protocolContext,
    eventType: 'protocol.created',
    requestId: seedUuid(),
    details: { draftId: line.draftId },
  });
  record(seedTime(-341), {
    ...protocolContext,
    eventType: 'protocol.draft.committed',
    requestId: seedUuid(),
    details: {
      draftId: line.draftId,
      revision: '2',
      affectedSectionIds: sectionIds.length > 0 ? sectionIds : ['settings'],
      operationTypes: ['addStage', 'set'],
      operationCount: 2,
    },
  });

  // The first colleague was invited as a plain member and promoted to the
  // admin role their membership now records, so the timeline below reads as
  // one story: invited, accepted, promoted.
  // The colleagues joined in the team's first days, 400 days before the
  // anchor (seed/teams.ts), and before the protocol line was created.
  const promoted = invited[0];
  for (const [index, member] of invited.entries()) {
    const invitedAs = member === promoted ? 'member' : member.role;
    // One invitation, two events: the creation and the acceptance describe
    // the same durable subject, which is how a timeline correlates them.
    const invitationId = seedUuid();
    record(seedTime(-399, index * 30), {
      ...teamAccess,
      eventType: 'team.invitation.created',
      requestId: seedUuid(),
      subjectType: 'team_invitation',
      subjectId: invitationId,
      subjectLabel: member.email,
      details: { role: invitedAs },
    });
    record(seedTime(-398, index * 30), {
      ...teamAccess,
      eventType: 'team.invitation.accepted',
      requestId: seedUuid(),
      subjectType: 'team_invitation',
      subjectId: invitationId,
      subjectLabel: member.email,
      details: { role: invitedAs, memberId: member.memberId },
    });
  }

  if (promoted !== undefined) {
    record(seedTime(-396), {
      ...teamAccess,
      eventType: 'team.member.role_changed',
      requestId: seedUuid(),
      subjectType: 'team_member',
      subjectId: promoted.memberId,
      subjectLabel: promoted.name,
      details: { previousRoles: ['member'], newRoles: [promoted.role] },
    });
  }

  // A denial the real audit-read rule could produce: owners and admins hold
  // audit.read, so the actor is a plain member — and a team without one
  // records no denial rather than an impossible one.
  const denied = team.members.find((member) => member.role === 'member');
  if (denied !== undefined) {
    record(seedTime(-12), {
      ...actor,
      actorId: denied.userId,
      actorLabel: denied.name,
      eventVersion: 1,
      eventType: 'audit.read_denied',
      category: 'audit',
      outcome: 'denied',
      requestId: seedUuid(),
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      details: { procedure: 'audit.list', reason: 'insufficient_permission' },
    });
  }

  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (const { occurredAt, event } of events) {
    await appendSeedAuditEvent(client, event, { occurredAt });
  }
  return events.length;
}
