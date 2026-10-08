import { and, eq, inArray } from 'drizzle-orm';
import { Clock, Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { UsageInterfaceType, type UsageEvent } from '@codaco/studio-sync/jobs';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';

import type { AuditEventInput } from '../audit/events.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { Analytics } from '../platform/analytics.ts';
import { STUDY_TABLES } from '../study/schema.ts';
import { participantAnalyticsEnabled } from '../study/settings.ts';
import { recordUsage } from './usage-events.ts';

type AuditEventType = AuditEventInput['eventType'];

type AuditEventOf<Type extends AuditEventType> = Extract<
  AuditEventInput,
  { eventType: Type }
>;

export type AuditUsageDecision<Type extends AuditEventType> =
  | {
      readonly kind: 'event';
      readonly usage: (
        event: AuditEventOf<Type>,
        occurredAt: number,
      ) => Effect.Effect<UsageEvent | null, SqlError.SqlError, Transaction>;
    }
  | { readonly kind: 'none'; readonly reason: string };

const DENIAL =
  'A denied attempt changed nothing, and usage counts only what researchers and participants did.';

const FAILURE =
  'A failed attempt changed nothing, and usage counts only what researchers and participants did.';

const isInterfaceType = Schema.is(UsageInterfaceType);

const { drafts, manifests, sections } = SYNC_TABLES;

const { studies } = STUDY_TABLES;

const studyAllowsParticipantAnalytics = Effect.fnUntraced(function* (
  teamId: string,
  studyId: string,
) {
  const { tx } = yield* Transaction;
  const rows = yield* sqlErrorsOnly(
    tx
      .select({ settings: studies.settings })
      .from(studies)
      .where(and(eq(studies.id, studyId), eq(studies.teamId, teamId))),
  );
  return participantAnalyticsEnabled(rows[0]?.settings);
});

const STAGE_SECTION_PREFIX = 'stage:';

const draftInterfaceTypes = Effect.fnUntraced(function* (
  teamId: string,
  draftId: string,
) {
  const { tx } = yield* Transaction;
  const heads = yield* sqlErrorsOnly(
    tx
      .select({ sectionHashes: manifests.sectionHashes })
      .from(drafts)
      .innerJoin(
        manifests,
        and(
          eq(manifests.draftId, drafts.id),
          eq(manifests.teamId, drafts.teamId),
          eq(manifests.seq, drafts.headSeq),
        ),
      )
      .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId))),
  );
  const stageHashes = [
    ...new Set(
      Object.entries(heads[0]?.sectionHashes ?? {})
        .filter(([sectionId]) => sectionId.startsWith(STAGE_SECTION_PREFIX))
        .map(([, hash]) => hash),
    ),
  ];
  if (stageHashes.length === 0) return [];
  const stages = yield* sqlErrorsOnly(
    tx
      .select({ doc: sections.doc })
      .from(sections)
      .where(
        and(eq(sections.teamId, teamId), inArray(sections.hash, stageHashes)),
      ),
  );
  return [...new Set(stages.map(({ doc }) => doc.type))]
    .filter(isInterfaceType)
    .toSorted();
});

export const AUDIT_USAGE_DECISIONS: {
  readonly [Type in AuditEventType]: AuditUsageDecision<Type>;
} = {
  'team.member.role_changed': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.succeed({
        event: 'team_member_role_changed',
        occurredAt,
        accountId: event.actorId,
        teamId: event.teamId,
        memberId: event.subjectId,
        previousRoles: event.details.previousRoles,
        newRoles: event.details.newRoles,
      }),
  },
  'team.member.role_change_denied': { kind: 'none', reason: DENIAL },
  'team.member.role_change_failed': { kind: 'none', reason: FAILURE },
  'team.invitation.created': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.succeed({
        event: 'team_invitation_sent',
        occurredAt,
        accountId: event.actorId,
        teamId: event.teamId,
        invitationId: event.subjectId,
        role: event.details.role,
      }),
  },
  'team.invitation.creation_denied': { kind: 'none', reason: DENIAL },
  'team.invitation.cancelled': {
    kind: 'none',
    reason:
      'Withdrawing an invitation is housekeeping, not one of the actions the usage figures count; the invitation it withdraws was counted when it was sent.',
  },
  'team.invitation.cancellation_denied': { kind: 'none', reason: DENIAL },
  'team.invitation.cancellation_failed': { kind: 'none', reason: FAILURE },
  'team.invitation.accepted': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.succeed({
        event: 'team_invitation_accepted',
        occurredAt,
        accountId: event.actorId,
        teamId: event.teamId,
        invitationId: event.subjectId,
        role: event.details.role,
      }),
  },
  'team.invitation.acceptance_denied': { kind: 'none', reason: DENIAL },
  'team.invitation.acceptance_failed': { kind: 'none', reason: FAILURE },
  'audit.read_denied': {
    kind: 'none',
    reason:
      'Reading the audit log is not usage of the research platform, and this event records a refused read.',
  },
  'security.denied_attempts.rate_limited': {
    kind: 'none',
    reason:
      'A summary of suppressed denials is a security record of attempts that changed nothing.',
  },
  'protocol.created': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.succeed({
        event: 'protocol_created',
        occurredAt,
        accountId: event.actorId,
        teamId: event.teamId,
        protocolId: event.resourceId,
      }),
  },
  'protocol.draft.committed': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.map(
        draftInterfaceTypes(event.teamId, event.details.draftId),
        (interfaceTypes) => ({
          event: 'protocol_draft_committed',
          occurredAt,
          accountId: event.actorId,
          teamId: event.teamId,
          protocolId: event.resourceId,
          interfaceTypes,
          operationCount: event.details.operationCount,
        }),
      ),
  },
  'study.created': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.succeed({
        event: 'study_created',
        occurredAt,
        accountId: event.actorId,
        teamId: event.teamId,
        studyId: event.resourceId,
        protocolId: event.details.protocolId,
        participationMode: event.details.participationMode,
      }),
  },
  'study.creation_denied': { kind: 'none', reason: DENIAL },
  'interview.started': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.map(
        studyAllowsParticipantAnalytics(event.teamId, event.details.studyId),
        (allowed): UsageEvent | null =>
          allowed
            ? {
                event: 'interview_started',
                occurredAt,
                teamId: event.teamId,
                sessionId: event.resourceId,
                studyId: event.details.studyId,
                waveId: event.details.waveId,
                resumed: event.details.resumed,
              }
            : null,
      ),
  },
  'interview.completed': {
    kind: 'event',
    usage: (event, occurredAt) =>
      Effect.map(
        studyAllowsParticipantAnalytics(event.teamId, event.details.studyId),
        (allowed): UsageEvent | null =>
          allowed
            ? {
                event: 'interview_completed',
                occurredAt,
                teamId: event.teamId,
                sessionId: event.resourceId,
                studyId: event.details.studyId,
                waveId: event.details.waveId,
                nodeCount: event.details.nodeCount,
                edgeCount: event.details.edgeCount,
              }
            : null,
      ),
  },
};

const usageFor = <Type extends AuditEventType>(
  eventType: Type,
  event: AuditEventOf<Type>,
  occurredAt: number,
): Effect.Effect<UsageEvent | null, SqlError.SqlError, Transaction> => {
  const decision: AuditUsageDecision<Type> = AUDIT_USAGE_DECISIONS[eventType];
  return decision.kind === 'none'
    ? Effect.succeed(null)
    : decision.usage(event, occurredAt);
};

export const recordAuditUsage = Effect.fnUntraced(function* (
  event: AuditEventInput,
) {
  if (event.outcome !== 'succeeded') return;
  const analytics = yield* Analytics;
  if (!analytics.enabled) return;
  const occurredAt = yield* Clock.currentTimeMillis;
  const usage = yield* usageFor(event.eventType, event, occurredAt);
  if (usage === null) return;
  yield* recordUsage(usage);
});
