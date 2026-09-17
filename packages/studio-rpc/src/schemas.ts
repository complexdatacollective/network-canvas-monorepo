import { z } from 'zod';

// The enum tuples are imported from the Effect contract rather than declared
// twice: this file's zod schemas and the contract's `Schema` ones describe the
// same wire values, so one tuple each is what stops the two boundaries
// drifting. They are re-exported below, beside the zod schema each one feeds,
// because today's importers read them from here.
import {
  AUDIT_ACTOR_KINDS,
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
} from '@codaco/studio-contract/schema/audit';
import { SOCIAL_PROVIDERS } from '@codaco/studio-contract/schema/status';
import {
  STUDY_PARTICIPATION_MODES,
  STUDY_STATES,
} from '@codaco/studio-contract/schema/study';
import { TEAM_ROLES } from '@codaco/studio-contract/schema/team';

// What is left of the zod boundary for the internal RPC surface.
//
// The twenty researcher-facing procedures validate through
// `@codaco/studio-contract`'s Effect schemas now (#1930), so the payload and
// result schemas they used are gone. What remains is the vocabulary the
// server's own stores, commands and audit renderers type themselves from — the
// enum tuples, the name bounds, and the audit row shapes — which moves when
// that code does rather than when the boundary does.

export { SOCIAL_PROVIDERS, TEAM_ROLES };
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export const TeamRoleSchema = z.enum(TEAM_ROLES);
export type TeamRole = z.infer<typeof TeamRoleSchema>;
export const TeamInvitationIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/);

export const ProtocolNameSchema = z
  .string()
  .min(1)
  .max(320)
  .refine((name) => name.trim().length > 0, {
    error: 'Protocol name must contain a non-whitespace character',
  });

// The study tier (#1262). A study is the team-scoped object a researcher
// works in; the protocol line it points at describes only the interview.
// Both enums mirror the `studies_state_check` and
// `studies_participation_mode_check` constraints, so a value the database
// refuses cannot reach it, and a value it gains needs a migration this
// boundary is versioned alongside.
export { STUDY_STATES };
export const StudyStateSchema = z.enum(STUDY_STATES);
export type StudyState = z.infer<typeof StudyStateSchema>;

export { STUDY_PARTICIPATION_MODES };
export const StudyParticipationModeSchema = z.enum(STUDY_PARTICIPATION_MODES);
export type StudyParticipationMode = z.infer<
  typeof StudyParticipationModeSchema
>;

// The same bound as `studies_name_nonblank_check`, refused here so a blank
// name is a field error rather than a constraint violation.
export const StudyNameSchema = z
  .string()
  .min(1)
  .max(320)
  .refine((name) => name.trim().length > 0, {
    error: 'Study name must contain a non-whitespace character',
  });

// Every value carried by this schema is a PostgreSQL `bigint` on the wire, and
// the server hands these strings straight to a `::bigint` cast. The digit
// budget and range bound keep an over-range decimal an input rejection instead
// of a numeric_value_out_of_range error raised inside the query.
const PG_BIGINT_MAX = 9223372036854775807n;
const DECIMAL_SEQUENCE_PATTERN = /^\d{1,19}$/;
const DecimalSequenceSchema = z
  .string()
  .regex(DECIMAL_SEQUENCE_PATTERN)
  .refine(
    // Zod runs every check on a string schema, including after an earlier one
    // failed, so this predicate must also be total for values the pattern
    // already rejected — BigInt() throws on them rather than returning false.
    (value) =>
      !DECIMAL_SEQUENCE_PATTERN.test(value) || BigInt(value) <= PG_BIGINT_MAX,
    { message: 'must be within the PostgreSQL bigint range' },
  );

// Plain counts, not a rendered string: `NavItem` formats them in the runtime's
// locale, and it is the one that decides a zero is left off entirely.
const StudyCountsSchema = z.object({
  /** Published versions of the study's protocol line; 0 while it has none. */
  versions: z.number().int().nonnegative(),
  participants: z.number().int().nonnegative(),
  waves: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type StudyCounts = z.infer<typeof StudyCountsSchema>;

export { AUDIT_CATEGORIES };
export const AuditCategorySchema = z.enum(AUDIT_CATEGORIES);
export type AuditCategory = z.infer<typeof AuditCategorySchema>;

export { AUDIT_OUTCOMES };
export const AuditOutcomeSchema = z.enum(AUDIT_OUTCOMES);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditActorKindSchema = z.enum(AUDIT_ACTOR_KINDS);

// One actor exactly as the feed renders it. `id` is null only for a system
// actor that carries no stable identifier (design §5: `actor_id` is required
// unless `actor_kind = 'system'`), so filtering for system activity needs no
// sentinel smuggled through a field typed as an id — the absent id *is* the
// value. Filtering on the pair also keeps every case served by the existing
// (team_id, actor_id, sequence DESC) index.
const AuditActorFilterSchema = z.object({
  kind: AuditActorKindSchema,
  id: z.string().min(1).max(255).nullable(),
});
export type AuditActorFilter = z.infer<typeof AuditActorFilterSchema>;

const AuditActorSchema = z.object({
  kind: AuditActorKindSchema,
  id: z.string().nullable(),
  label: z.string(),
});

const AuditEventReferenceSchema = z.object({
  type: z.string(),
  id: z.string().nullable(),
  label: z.string().nullable(),
});

// `title` and `rendered` come from the server's versioned event registry; an
// event pair this build does not register renders generically (machine type,
// no details) rather than borrowing another version's renderer.
export const AuditEventSummarySchema = z.object({
  id: z.uuid(),
  sequence: DecimalSequenceSchema,
  occurredAt: z.date(),
  eventType: z.string(),
  eventVersion: z.number().int(),
  category: AuditCategorySchema,
  outcome: AuditOutcomeSchema,
  actor: AuditActorSchema,
  subject: AuditEventReferenceSchema.nullable(),
  resource: AuditEventReferenceSchema.nullable(),
  title: z.string(),
  rendered: z.boolean(),
});
export type AuditEventSummary = z.infer<typeof AuditEventSummarySchema>;

// Filter values are drawn from the team's whole history, not from the pages
// the client happens to have loaded, so an action or actor that appears only
// in old history is still selectable. In practice the set is small — the
// actions a build registers, and the people and tokens that have ever acted in
// one team — but neither is bounded by anything the server controls (rows
// appended by a newer server carry event types this build never registered),
// so the scan stops at this cap and `truncated` says the list is incomplete
// rather than silently shortening it.
export const AUDIT_FACET_LIMIT = 200;

export const AuditFilterOptionsSchema = z.object({
  actions: z.array(z.object({ eventType: z.string(), title: z.string() })),
  actors: z.array(AuditActorFilterSchema.extend({ label: z.string() })),
  truncated: z.boolean(),
});
export type AuditFilterOptions = z.infer<typeof AuditFilterOptionsSchema>;

export const AuditEventDetailSchema = AuditEventSummarySchema.extend({
  teamLabel: z.string(),
  requestId: z.uuid(),
  details: z.record(z.string(), z.unknown()),
});
export type AuditEventDetail = z.infer<typeof AuditEventDetailSchema>;
