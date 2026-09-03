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
//   - `audit_events.id` comes from `randomUUID()` inside the writer, and
//     `occurred_at` from `statement_timestamp()`. Neither is reachable from
//     the seed's PRNG or its fixed anchor, so those two columns are the only
//     values in the whole seed that differ between two runs.
//   - `audit_export_jobs` and `audit_alert_outbox` are left empty. They have
//     no production writer yet — only tests insert into them — so seeding them
//     would mean inventing rows that bypass invariants no code has stated.
import type pg from 'pg';

import type { AuditEventInput } from '../../audit/events.ts';
import { AuditStore } from '../../audit/store.ts';
import type { SeededProtocolLine } from './protocols.ts';
import { seedUuid } from './rng.ts';
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

  const events: AuditEventInput[] = [
    {
      ...protocolContext,
      eventType: 'protocol.created',
      requestId: seedUuid(),
      details: { draftId: line.draftId },
    },
    {
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
    },
  ];

  for (const member of invited) {
    events.push({
      ...teamAccess,
      eventType: 'team.invitation.created',
      requestId: seedUuid(),
      subjectType: 'team_invitation',
      subjectId: seedUuid(),
      subjectLabel: member.email,
      details: { role: member.role },
    });
    events.push({
      ...teamAccess,
      eventType: 'team.invitation.accepted',
      requestId: seedUuid(),
      subjectType: 'team_invitation',
      subjectId: seedUuid(),
      subjectLabel: member.email,
      details: { role: member.role, memberId: member.memberId },
    });
  }

  const promoted = invited[0];
  if (promoted !== undefined) {
    events.push({
      ...teamAccess,
      eventType: 'team.member.role_changed',
      requestId: seedUuid(),
      subjectType: 'team_member',
      subjectId: promoted.memberId,
      subjectLabel: promoted.name,
      details: { previousRoles: ['member'], newRoles: [promoted.role] },
    });
  }

  events.push({
    ...actor,
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

  for (const event of events) {
    await auditStore.append(client, event);
  }
  return events.length;
}
