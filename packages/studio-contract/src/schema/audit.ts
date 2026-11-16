import { Schema } from 'effect';

import { AuditEventId } from './ids.ts';
import { DecimalSequence, PrivateString } from './primitives.ts';
import { TeamScoped } from './team.ts';

export const AUDIT_CATEGORIES = [
  'team_access',
  'protocol',
  'study',
  'participant_data',
  'data_egress',
  'credential',
  'integration',
  'security',
  'audit',
] as const;
export const AuditCategory = Schema.Literals(AUDIT_CATEGORIES);
export type AuditCategory = (typeof AuditCategory)['Type'];

export const AUDIT_OUTCOMES = ['succeeded', 'denied', 'failed'] as const;
export const AuditOutcome = Schema.Literals(AUDIT_OUTCOMES);
export type AuditOutcome = (typeof AuditOutcome)['Type'];

/**
 * Every kind of action this build records, by its stable event type.
 *
 * The server's event registry is checked against this list in both
 * directions, and the client names each one in the reader's language, so a
 * new kind of action cannot reach the activity screen without a name of its
 * own. History can still hold types a newer server appended, which is why an
 * event's `eventType` stays a plain string.
 */
export const AUDIT_EVENT_TYPES = [
  'audit.read_denied',
  'team.created',
  'team.member.role_changed',
  'team.member.role_change_denied',
  'team.member.role_change_failed',
  'security.denied_attempts.rate_limited',
  'team.invitation.created',
  'team.invitation.creation_denied',
  'team.invitation.cancelled',
  'team.invitation.cancellation_denied',
  'team.invitation.cancellation_failed',
  'team.invitation.accepted',
  'team.invitation.acceptance_denied',
  'team.invitation.acceptance_failed',
  'protocol.created',
  'protocol.draft.committed',
  'study.created',
  'study.creation_denied',
  'interview.started',
  'interview.completed',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

const AUDIT_EVENT_TYPE_SET: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);

export function isAuditEventType(value: string): value is AuditEventType {
  return AUDIT_EVENT_TYPE_SET.has(value);
}

export const AUDIT_ACTOR_KINDS = [
  'user',
  'api_token',
  'system',
  'participant',
] as const;
export const AuditActorKind = Schema.Literals(AUDIT_ACTOR_KINDS);

export const AuditActorFilter = Schema.Struct({
  kind: AuditActorKind,
  id: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  ),
});
export type AuditActorFilter = (typeof AuditActorFilter)['Type'];

export const AuditListInput = Schema.Struct({
  ...TeamScoped.fields,
  cursor: Schema.optionalKey(DecimalSequence),
  limit: Schema.optionalKey(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isBetween({ minimum: 1, maximum: 100 }),
    ),
  ),
  categories: Schema.optionalKey(
    Schema.Array(AuditCategory).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(AUDIT_CATEGORIES.length),
    ),
  ),
  // Not the event types this build registers: history includes rows a newer
  // server appended, so the bound is `audit_events_identifier_lengths_check`.
  eventTypes: Schema.optionalKey(
    Schema.Array(
      Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
  ),
  actor: Schema.optionalKey(AuditActorFilter),
  outcomes: Schema.optionalKey(
    Schema.Array(AuditOutcome).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(AUDIT_OUTCOMES.length),
    ),
  ),
  // A half-open window, `from <= occurred_at < to`: Postgres keeps
  // `occurred_at` to microseconds, which an inclusive `Date` end would miss.
  from: Schema.optionalKey(Schema.Date),
  to: Schema.optionalKey(Schema.Date),
});

const AuditActor = Schema.Struct({
  kind: AuditActorKind,
  id: Schema.NullOr(Schema.String),
  label: PrivateString,
});

const AuditEventReference = Schema.Struct({
  type: Schema.String,
  id: Schema.NullOr(Schema.String),
  label: Schema.NullOr(PrivateString),
});

export const AuditEventSummary = Schema.Struct({
  id: AuditEventId,
  sequence: DecimalSequence,
  occurredAt: Schema.Date,
  eventType: Schema.String,
  eventVersion: Schema.Number.check(Schema.isInt()),
  category: AuditCategory,
  outcome: AuditOutcome,
  actor: AuditActor,
  subject: Schema.NullOr(AuditEventReference),
  resource: Schema.NullOr(AuditEventReference),
  rendered: Schema.Boolean,
});
export type AuditEventSummary = (typeof AuditEventSummary)['Type'];

export const AuditListOutput = Schema.Struct({
  items: Schema.Array(AuditEventSummary),
  nextCursor: Schema.NullOr(DecimalSequence),
});

export const AUDIT_FACET_LIMIT = 200;

export const AuditFilterOptions = Schema.Struct({
  eventTypes: Schema.Array(Schema.String),
  actors: Schema.Array(
    Schema.Struct({ ...AuditActorFilter.fields, label: PrivateString }),
  ),
  truncated: Schema.Boolean,
});
export type AuditFilterOptions = (typeof AuditFilterOptions)['Type'];

export const AuditGetInput = Schema.Struct({
  ...TeamScoped.fields,
  eventId: AuditEventId,
});

export const AuditEventDetail = Schema.Struct({
  ...AuditEventSummary.fields,
  teamLabel: PrivateString,
  requestId: Schema.String.check(Schema.isUUID()),
  details: Schema.RedactedFromValue(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
});
export type AuditEventDetail = (typeof AuditEventDetail)['Type'];

export class AuditReadDenied extends Schema.TaggedError<AuditReadDenied>()(
  'AuditReadDenied',
  {},
) {}

export class AuditTeamNotFound extends Schema.TaggedError<AuditTeamNotFound>()(
  'AuditTeamNotFound',
  {},
) {}
