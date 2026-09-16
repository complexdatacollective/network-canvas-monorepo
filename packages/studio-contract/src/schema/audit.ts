import { Schema } from 'effect';

import { AuditEventId } from './ids.ts';
import { DecimalSequence } from './primitives.ts';
import { TeamScoped } from './team.ts';

// The audit feed: what a team's history looks like when it is listed, filtered
// and opened.
//
// Input type == output type for every boundary schema here — no transforms,
// coercions, or divergent defaults — so one schema describes both what the
// server accepts and what the client receives. Declared result schemas are
// also the serialization allowlist: fields not named here are stripped before
// they reach the wire.

// Mirrors the audit_events category/outcome/actor-kind CHECK constraints; a
// new value requires a schema migration, which the fingerprint pipeline keeps
// in lockstep with deployed code.
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

// One actor exactly as the feed renders it. `id` is null only for a system
// actor that carries no stable identifier (design §5: `actor_id` is required
// unless `actor_kind = 'system'`), so filtering for system activity needs no
// sentinel smuggled through a field typed as an id — the absent id *is* the
// value. Filtering on the pair also keeps every case served by the existing
// (team_id, actor_id, sequence DESC) index.
export const AuditActorFilter = Schema.Struct({
  kind: AuditActorKind,
  id: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  ),
});
export type AuditActorFilter = (typeof AuditActorFilter)['Type'];

// Sequences are per-team bigints represented as base-10 strings on the wire;
// clients display and round-trip them but never do arithmetic on them. The
// cursor is the last returned sequence and pages request `sequence < cursor`.
export const AuditListInput = Schema.Struct({
  ...TeamScoped.fields,
  cursor: Schema.optionalKey(DecimalSequence),
  // Absent means "the server's page size", which the handler owns; there is
  // deliberately no default here, so the contract cannot drift from it.
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
  // Not the event types this build registers: the filter list is drawn from
  // the team's whole history, which includes rows a newer server appended, so
  // the only bound that holds is the one the table itself enforces
  // (`audit_events_identifier_lengths_check`: `event_type` is 1–128
  // characters). A narrower bound here would show an event in the feed, offer
  // it in the action menu, and then reject the selection as a bad request.
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
  // A half-open instant window, `from <= occurred_at < to`. `occurred_at` is
  // `statement_timestamp()`, which Postgres keeps to microseconds, so an
  // inclusive end could never name the true last instant of a day — any bound
  // a millisecond-precision `Date` can express leaves the final fractional
  // millisecond outside it. Callers selecting a calendar day send the start of
  // the following day, and both bounds are absolute instants, so the day
  // boundaries are the caller's local ones whatever timezone the server keeps.
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

// `title` and `rendered` come from the server's versioned event registry; an
// event pair this build does not register renders generically (machine type,
// no details) rather than borrowing another version's renderer.
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

// Filter values are drawn from the team's whole history, not from the pages
// the client happens to have loaded, so an action or actor that appears only
// in old history is still selectable. In practice the set is small — the
// actions a build registers, and the people and tokens that have ever acted in
// one team — but neither is bounded by anything the server controls (rows
// appended by a newer server carry event types this build never registered),
// so the scan stops at this cap and `truncated` says the list is incomplete
// rather than silently shortening it.
export const AUDIT_FACET_LIMIT = 200;

// The input is TeamScoped itself, as protocols.list is: the option set is a
// property of the team and takes no other argument.
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

/**
 * The read path's own refusal, raised when the caller may not read a team's
 * audit history. It is not on any procedure's error channel: `audit.list`,
 * `audit.get` and `audit.filterOptions` declare the shared `Forbidden`
 * instead, so a caller reads one error vocabulary across every surface.
 */
export class AuditReadDenied extends Schema.TaggedError<AuditReadDenied>()(
  'AuditReadDenied',
  {},
) {}

/**
 * Raised when the team an audit command names no longer exists by the time the
 * command locks it. Internal in the same way as `AuditReadDenied`: the
 * procedure surfaces the shared `NotFound`.
 */
export class AuditTeamNotFound extends Schema.TaggedError<AuditTeamNotFound>()(
  'AuditTeamNotFound',
  {},
) {}
