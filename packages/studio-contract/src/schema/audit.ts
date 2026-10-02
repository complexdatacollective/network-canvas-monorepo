import { Schema } from 'effect';

import { AuditEventId } from './ids.ts';
import { DecimalSequence } from './primitives.ts';
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

export const AUDIT_ACTOR_KINDS = ['user', 'api_token', 'system'] as const;
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
  label: Schema.String,
});

const AuditEventReference = Schema.Struct({
  type: Schema.String,
  id: Schema.NullOr(Schema.String),
  label: Schema.NullOr(Schema.String),
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
  title: Schema.String,
  rendered: Schema.Boolean,
});
export type AuditEventSummary = (typeof AuditEventSummary)['Type'];

export const AuditListOutput = Schema.Struct({
  items: Schema.Array(AuditEventSummary),
  nextCursor: Schema.NullOr(DecimalSequence),
});

export const AUDIT_FACET_LIMIT = 200;

export const AuditFilterOptions = Schema.Struct({
  actions: Schema.Array(
    Schema.Struct({ eventType: Schema.String, title: Schema.String }),
  ),
  actors: Schema.Array(
    Schema.Struct({ ...AuditActorFilter.fields, label: Schema.String }),
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
  teamLabel: Schema.String,
  requestId: Schema.String.check(Schema.isUUID()),
  details: Schema.Record(Schema.String, Schema.Unknown),
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
