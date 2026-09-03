// A short, plausible activity history per team, appended through the real
// audit writer.
//
// `AuditStore.append` is used rather than an INSERT, deliberately: it is the
// only code that allocates a team's `sequence` under the advisory lock and
// validates the event against its registered schema, and a raw insert here
// would be a second writer of an append-only log whose whole value is that it
// has one. Two consequences follow, and both are load-bearing for the
// determinism test:
//
//   - `audit_events.id` comes from `randomUUID()` inside the writer, which
//     is not reachable from the seed's PRNG, so that column is the only
//     value in the whole seed that differs between two runs. `occurred_at`
//     is passed in: each event is dated to the operation it records, so the
//     log agrees with the rows — a protocol created before the versions
//     that were published from it, a draft edit before the version it
//     produced, a colleague invited before they were promoted.
//   - `audit_export_jobs` and `audit_alert_outbox` are left empty. They have
//     no production writer yet — only tests insert into them — so seeding them
//     would mean inventing rows that bypass invariants no code has stated.
import type pg from 'pg';

import type { AuditEventInput } from '../../audit/events.ts';
import { AuditStore } from '../../audit/store.ts';
import type { SeededProtocolLine } from './protocols.ts';
import { seedTime, seedUuid } from './rng.ts';
import type { SeedTeam } from './teams.ts';

const auditStore = new AuditStore();

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
    await auditStore.append(client, event, { occurredAt });
  }
  return events.length;
}
