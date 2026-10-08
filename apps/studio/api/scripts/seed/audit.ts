import { Effect, Redacted } from 'effect';

import type { AuditEventInput } from '../../src/audit/events.ts';
import { append } from '../../src/audit/store.ts';
import type { SeededProtocolLine } from './protocols.ts';
import { seedTime, seedUuid } from './rng.ts';
import type { SeedTeam } from './teams.ts';

export const seedAuditEvents = Effect.fnUntraced(function* (
  team: SeedTeam,
  line: SeededProtocolLine,
) {
  const actor = {
    teamId: team.id,
    teamLabel: Redacted.make(team.name),
    actorKind: 'user',
    actorId: team.adminUserId,
    actorLabel: Redacted.make('Studio Admin'),
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
    resourceLabel: Redacted.make(line.name),
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
      subjectLabel: Redacted.make(member.email),
      details: { role: invitedAs },
    });
    record(seedTime(-398, index * 30), {
      ...teamAccess,
      eventType: 'team.invitation.accepted',
      requestId: seedUuid(),
      subjectType: 'team_invitation',
      subjectId: invitationId,
      subjectLabel: Redacted.make(member.email),
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
      subjectLabel: Redacted.make(promoted.name),
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
      actorLabel: Redacted.make(denied.name),
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
    yield* append(event, { occurredAt });
  }
  return events.length;
});
