import { z } from 'zod';

import { DEPLOYMENT_MODES } from './surfaces.ts';

// Schemas for the internal RPC boundary, shared source-first between server
// validation and the client's types (type-only on the client). This surface
// is unpublished (#1248, 2026-08-11): no OpenAPI metadata, no registry ids.
// Boundary schemas must have identical input and output types — no
// `.transform()`, coercions, or divergent defaults — so one schema describes
// both what the server emits and what the client receives. Declared output
// schemas are also the serialization allowlist: fields not named here are
// stripped before they reach the wire.

export const SOCIAL_PROVIDERS = ['google', 'microsoft'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export const TEAM_ROLES = ['owner', 'admin', 'member'] as const;
export const TeamRoleSchema = z.enum(TEAM_ROLES);
export type TeamRole = z.infer<typeof TeamRoleSchema>;
export const TeamInvitationIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/);

// Read through `StatusSchema`; the server's `DeploymentStatus` and the
// client's view of it are both inferred from that one output type.
const DeploymentSchema = z.object({
  /** Which topology this deployment serves; see `./surfaces.ts`. */
  mode: z.enum(DEPLOYMENT_MODES),
  /**
   * Whether the deployment offers billing. Not implied by `managed`: billing
   * (#1253) is separate configuration, and the shell has to render correctly
   * where it is absent.
   */
  billing: z.boolean(),
});

export const StatusSchema = z.object({
  name: z.string(),
  version: z.string(),
  auth: z.object({
    enabled: z.boolean(),
    magicLink: z.boolean(),
    emailAndPassword: z.boolean(),
    socialProviders: z.array(z.enum(SOCIAL_PROVIDERS)),
  }),
  deployment: DeploymentSchema,
});

export const MeSchema = z.object({
  userId: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  name: z.string(),
});

// Every team-scoped procedure names its team explicitly — the authz input is
// never the session's active team (#1248: every route is team-scoped by
// construction).
export const TeamScopedSchema = z.object({
  teamId: z.string().min(1),
});

export const UpdateTeamMemberRoleInputSchema = TeamScopedSchema.extend({
  memberId: z.string().min(1),
  role: TeamRoleSchema,
});

export const UpdateTeamMemberRoleResultSchema = z.object({
  memberId: z.string().min(1),
  role: TeamRoleSchema,
});

export const CreateTeamInvitationInputSchema = TeamScopedSchema.extend({
  email: z.email().max(320),
  role: TeamRoleSchema,
});

export const CreateTeamInvitationResultSchema = z.object({
  invitationId: TeamInvitationIdSchema,
  email: z.email().max(320),
  role: TeamRoleSchema,
  status: z.literal('pending'),
  expiresAt: z.date(),
});

export const CancelTeamInvitationInputSchema = TeamScopedSchema.extend({
  invitationId: TeamInvitationIdSchema,
});

export const CancelTeamInvitationResultSchema = z.object({
  invitationId: TeamInvitationIdSchema,
  status: z.literal('canceled'),
});

// Acceptance deliberately has no teamId: the authenticated invitee is not a
// member yet, so the server resolves and locks the invitation's team instead
// of trusting a tenant chosen by the browser.
export const AcceptTeamInvitationInputSchema = z.object({
  invitationId: TeamInvitationIdSchema,
});

export const AcceptTeamInvitationResultSchema = z.object({
  invitationId: TeamInvitationIdSchema,
  teamId: z.string().min(1).max(255),
  teamName: z.string().min(1).max(320),
  memberId: z.string().min(1).max(255),
  role: TeamRoleSchema,
  status: z.literal('accepted'),
});

export const ProtocolSummarySchema = z.object({
  id: z.uuid(),
  draftId: z.uuid().nullable(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

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
export const STUDY_STATES = ['draft', 'live', 'paused', 'closed'] as const;
export const StudyStateSchema = z.enum(STUDY_STATES);
export type StudyState = z.infer<typeof StudyStateSchema>;

export const STUDY_PARTICIPATION_MODES = ['managed', 'anonymous'] as const;
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

/**
 * One study as its team's list reports it. `protocolId` is nullable because
 * the column is: a Draft study may retarget its protocol line, and the
 * schema keeps the pin optional until go-live (#1262).
 *
 * The two counts come from the same row as the study, so the picker can say
 * how much work a study holds without a request per study. They are
 * decoration — a study with neither still lists — and they are not the study
 * sidebar's counts, which are per-destination and answered elsewhere.
 */
export const StudySummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  state: StudyStateSchema,
  participationMode: StudyParticipationModeSchema,
  protocolId: z.uuid().nullable(),
  createdAt: z.date(),
  waveCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
});

// No teamId, deliberately, and the same rule `AcceptTeamInvitationInputSchema`
// records above: a cold direct navigation to `/study/$studyId` carries no
// team, so the server resolves the tenant from the caller's own memberships
// (app-shell design §6.3) rather than trusting one chosen by the browser.
export const StudyGetInputSchema = z.object({
  studyId: z.uuid(),
});

export const StudyDetailSchema = z.object({
  /** The owning team, which only the server could say (§6.3). */
  teamId: z.string().min(1).max(255),
  study: StudySummarySchema,
  /**
   * The current editable draft of the study's protocol line, which is what
   * the protocol editor is addressed by. Null when the study has no protocol
   * line yet, or its line has no draft — two states the editor reports
   * differently from a study it cannot reach at all.
   */
  protocolDraftId: z.uuid().nullable(),
});

// Creation mints every identifier client-side for the same reason protocol
// creation does: a retry after a lost response repeats the same request
// rather than leaving a second study behind.
export const CreateStudyInputSchema = TeamScopedSchema.extend({
  name: StudyNameSchema,
  studyId: z.uuid(),
  protocolId: z.uuid(),
  draftId: z.uuid(),
});

export const CreateStudyResultSchema = z.object({
  studyId: z.uuid(),
  protocolId: z.uuid(),
  draftId: z.uuid(),
});

export const CreateProtocolInputSchema = TeamScopedSchema.extend({
  name: ProtocolNameSchema,
  protocolId: z.uuid(),
  draftId: z.uuid(),
});

export const CreateProtocolResultSchema = z.object({
  protocolId: z.uuid(),
  draftId: z.uuid(),
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
const SectionDocumentSchema = z.record(z.string(), z.unknown());

export const ProtocolDraftInputSchema = TeamScopedSchema.extend({
  protocolId: z.uuid(),
  draftId: z.uuid(),
});

export const ProtocolDraftSchema = z.object({
  protocol: ProtocolSummarySchema.extend({ draftId: z.uuid() }),
  revision: z.object({
    sequence: DecimalSequenceSchema,
    hash: z.string().min(1),
  }),
  sections: z.record(z.string(), SectionDocumentSchema),
});

const SectionScopedSchema = ProtocolDraftInputSchema.extend({
  sectionId: z.string().min(1).max(255),
  clientId: z.uuid(),
});

export const AcquireSectionInputSchema = SectionScopedSchema;
export const AcquireSectionResultSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('editable'),
    leaseEpoch: DecimalSequenceSchema,
    nextClientSequence: DecimalSequenceSchema,
  }),
  z.object({ mode: z.literal('readOnly') }),
]);

const CommandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), key: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('unset'), key: z.string() }),
  z.object({
    op: z.literal('insertItem'),
    key: z.string(),
    index: z.number().int().nonnegative(),
    item: z.unknown(),
  }),
  z.object({
    op: z.literal('removeItem'),
    key: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal('moveItem'),
    key: z.string(),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  }),
]);

export const CommitSectionInputSchema = SectionScopedSchema.extend({
  leaseEpoch: DecimalSequenceSchema,
  clientSequence: DecimalSequenceSchema,
  // Audit records the bounded operation count and kinds, never the command
  // values. Keep that summary and the commit work itself predictably bounded.
  commands: z.array(CommandSchema).min(1).max(1_000),
});

export const ManifestRevisionSchema = z.object({
  sequence: DecimalSequenceSchema,
  hash: z.string().min(1),
});

export const RenewSectionInputSchema = SectionScopedSchema.extend({
  leaseEpoch: DecimalSequenceSchema,
});

export const RenewSectionResultSchema = z.object({ renewed: z.boolean() });
export const ReleaseSectionInputSchema = SectionScopedSchema.extend({
  leaseEpoch: DecimalSequenceSchema,
});

export const AddInformationStageInputSchema = ProtocolDraftInputSchema.extend({
  stageId: z.uuid(),
});

export const MoveStageInputSchema = ProtocolDraftInputSchema.extend({
  stageId: z.string().min(1),
  toIndex: z.number().int().nonnegative(),
  expectedRevision: DecimalSequenceSchema,
});

// The four countable study destinations the app shell's sidebar carries
// (app-shell design §5.5). Deliberately one procedure rather than a count field
// on each destination's own list query: the sidebar needs all four on every
// study screen, including the screens that list none of them, and four
// separately-keyed queries would be four round trips whose answers could
// disagree with each other.
// Study id alone, like `StudyGetInputSchema`: the server resolves the team.
export const StudyCountsInputSchema = z.object({
  studyId: z.uuid(),
});

// Plain counts, not a rendered string: `NavItem` formats them in the runtime's
// locale, and it is the one that decides a zero is left off entirely.
export const StudyCountsSchema = z.object({
  /** Published versions of the study's protocol line; 0 while it has none. */
  versions: z.number().int().nonnegative(),
  participants: z.number().int().nonnegative(),
  waves: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type StudyCounts = z.infer<typeof StudyCountsSchema>;

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
export const AuditCategorySchema = z.enum(AUDIT_CATEGORIES);
export type AuditCategory = z.infer<typeof AuditCategorySchema>;

export const AUDIT_OUTCOMES = ['succeeded', 'denied', 'failed'] as const;
export const AuditOutcomeSchema = z.enum(AUDIT_OUTCOMES);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

const AUDIT_ACTOR_KINDS = ['user', 'api_token', 'system'] as const;
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

// Sequences are per-team bigints represented as base-10 strings on the wire;
// clients display and round-trip them but never do arithmetic on them. The
// cursor is the last returned sequence and pages request `sequence < cursor`.
export const AuditListInputSchema = TeamScopedSchema.extend({
  cursor: DecimalSequenceSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  categories: z
    .array(AuditCategorySchema)
    .min(1)
    .max(AUDIT_CATEGORIES.length)
    .optional(),
  // Not the event types this build registers: the filter list is drawn from
  // the team's whole history, which includes rows a newer server appended, so
  // the only bound that holds is the one the table itself enforces
  // (`audit_events_identifier_lengths_check`: `event_type` is 1–128
  // characters). A narrower bound here would show an event in the feed, offer
  // it in the action menu, and then reject the selection as a bad request.
  eventTypes: z.array(z.string().min(1).max(128)).min(1).max(20).optional(),
  actor: AuditActorFilterSchema.optional(),
  outcomes: z
    .array(AuditOutcomeSchema)
    .min(1)
    .max(AUDIT_OUTCOMES.length)
    .optional(),
  // A half-open instant window, `from <= occurred_at < to`. `occurred_at` is
  // `statement_timestamp()`, which Postgres keeps to microseconds, so an
  // inclusive end could never name the true last instant of a day — any bound
  // a millisecond-precision `Date` can express leaves the final fractional
  // millisecond outside it. Callers selecting a calendar day send the start of
  // the following day, and both bounds are absolute instants, so the day
  // boundaries are the caller's local ones whatever timezone the server keeps.
  from: z.date().optional(),
  to: z.date().optional(),
});

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

export const AuditListOutputSchema = z.object({
  items: z.array(AuditEventSummarySchema),
  nextCursor: DecimalSequenceSchema.nullable(),
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

// The input is TeamScopedSchema itself, as protocols.list is: the option set
// is a property of the team and takes no other argument.
export const AuditFilterOptionsSchema = z.object({
  actions: z.array(z.object({ eventType: z.string(), title: z.string() })),
  actors: z.array(AuditActorFilterSchema.extend({ label: z.string() })),
  truncated: z.boolean(),
});
export type AuditFilterOptions = z.infer<typeof AuditFilterOptionsSchema>;

export const AuditGetInputSchema = TeamScopedSchema.extend({
  eventId: z.uuid(),
});

export const AuditEventDetailSchema = AuditEventSummarySchema.extend({
  teamLabel: z.string(),
  requestId: z.uuid(),
  details: z.record(z.string(), z.unknown()),
});
export type AuditEventDetail = z.infer<typeof AuditEventDetailSchema>;
