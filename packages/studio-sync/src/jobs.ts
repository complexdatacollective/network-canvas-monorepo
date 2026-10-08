// Studio's background-job declarations (#1895): which queues exist, how each
// retries and expires, when the recurring ones run, and what a job on each may
// carry.
import { Predicate, Schema, type SchemaAST } from 'effect';

import type { CurrentProtocol } from '@codaco/protocol-validation';

export type JobQueueOptions = {
  policy?: 'standard' | 'singleton';
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  retryDelayMax?: number;
  expireInSeconds?: number;
  retentionSeconds?: number;
  /** `0` keeps completed jobs forever. */
  deleteAfterSeconds?: number;
  deadLetter?: string;
  warningQueueSize?: number;
};

export type JobQueueDeclaration = {
  name: string;
  options: JobQueueOptions;
};

/**
 * A `deadLetter` must name another queue in this list; the server refuses the
 * whole list at module load otherwise.
 */
export const JOB_QUEUES = [
  {
    // Kept until a researcher re-sends by hand (#1307), so nothing deletes it
    // and a month is the outer bound on how long that remedy stays available.
    name: 'invitation-delivery-dead-letter',
    options: {
      policy: 'standard',
      retryLimit: 0,
      deleteAfterSeconds: 0,
      retentionSeconds: 2_592_000,
    },
  },
  {
    // Eight attempts with exponential backoff from 5s to 30 minutes, matching
    // the hand-written dispatcher this replaces. The expiry is the outer bound
    // on one attempt: the SMTP transport's own timeouts (10s connect, 10s
    // greeting, 20s socket) all fit inside it.
    name: 'invitation-delivery',
    options: {
      policy: 'standard',
      retryLimit: 7,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 1800,
      expireInSeconds: 60,
      deadLetter: 'invitation-delivery-dead-letter',
    },
  },
  {
    // A sign-in link is useless once it expires, so a failed send is worth two
    // quick retries and nothing more: no dead letter, and both the job and its
    // record are gone within minutes — which holds only because the worker
    // sweeps retention every minute. Deletion happens on that sweep alone, so
    // at a day-scale retention this row, whose payload is the magic link
    // itself, would outlive the link by most of a day.
    name: 'sign-in-email',
    options: {
      policy: 'standard',
      retryLimit: 2,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 60,
      expireInSeconds: 30,
      retentionSeconds: 600,
      deleteAfterSeconds: 60,
    },
  },
  {
    // Summarising suppressed denied attempts is idempotent and cheap, and a
    // second run alongside the first would race the first for the same
    // suppression keys and could write the same summary event twice —
    // `singleton` lets at most one be active across every worker replica, and
    // a missed minute is picked up by the next run because the keys outlive
    // their window by several minutes (#1909).
    name: 'denied-attempts-summary',
    options: {
      policy: 'singleton',
      retryLimit: 0,
      expireInSeconds: 60,
    },
  },
  {
    // Sweeping the protocol store is idempotent and unbounded in duration, so
    // a second run alongside the first buys nothing: `singleton` lets at most
    // one be active, and a missed hour is picked up by the next one rather
    // than retried.
    name: 'protocol-store-gc',
    options: {
      policy: 'singleton',
      retryLimit: 0,
      expireInSeconds: 3600,
    },
  },
  {
    // The daily check for a newer Studio release (#1901). `singleton` because
    // two runs alongside each other would both read the same manifest and
    // race for the one-email-per-version claim; the claim is correct on its
    // own, but a second run has nothing to add. A missed day is picked up by
    // tomorrow's run, so a failed fetch retries only twice. The expiry is the
    // outer bound on one attempt and sits above the manifest fetch's own bound
    // (20s) plus the SMTP transport's (10s connect, 10s greeting, 20s socket),
    // so a slow send is never reaped while it is still running: a reaped
    // attempt would release the version's claim and a second email would follow.
    name: 'update-check',
    options: {
      policy: 'singleton',
      retryLimit: 2,
      expireInSeconds: 120,
      retentionSeconds: 7 * 24 * 3600,
      deleteAfterSeconds: 24 * 3600,
    },
  },
  {
    name: 'session-completed',
    options: {
      policy: 'standard',
    },
  },
  {
    name: 'analytics-delivery',
    options: {
      policy: 'standard',
      retryLimit: 20,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 3600,
      expireInSeconds: 60,
      retentionSeconds: 7 * 24 * 3600,
      deleteAfterSeconds: 3600,
    },
  },
] as const satisfies readonly JobQueueDeclaration[];

export type JobQueueName = (typeof JOB_QUEUES)[number]['name'];

export type JobSchedule = {
  queue: JobQueueName;
  cron: string;
  tz: string;
};

export const JOB_SCHEDULES = [
  { queue: 'protocol-store-gc', cron: '0 * * * *', tz: 'UTC' },
  // Every minute, because the thing it summarises is a one-minute window: a
  // longer cadence would leave a burst unrecorded for as long as the cadence,
  // and the job does nothing at all when no window was suppressed.
  { queue: 'denied-attempts-summary', cron: '* * * * *', tz: 'UTC' },
  // Daily, at a fixed minute off the hour. The minute is the same for every
  // instance, so the manifest host sees them arrive together; that is accepted
  // (no jitter, by decision, 16 Sep 2026). The off-the-hour minute only keeps
  // the check clear of the top-of-the-hour crons, and a fixed minute rather
  // than a random one keeps the schedule row from changing on each boot.
  { queue: 'update-check', cron: '23 4 * * *', tz: 'UTC' },
] as const satisfies readonly JobSchedule[];

const RowId = Schema.String.check(Schema.isUUID());

/**
 * Effect 4 ships no string-shaped URL check, and a payload column has to stay a
 * string.
 */
const isUrlString = Schema.makeFilter<string>(
  (value) => (URL.canParse(value) ? undefined : 'a URL'),
  { expected: 'a URL' },
);

const isPlainPrototype = (prototype: unknown): boolean =>
  prototype === null ||
  (Predicate.isObject(prototype) && Object.getPrototypeOf(prototype) === null);

/**
 * An empty `Schema.Struct` admits any non-nullish value and passes keys through,
 * so a queue that carries nothing has to check for a plain empty object itself.
 */
const isEmptyObject = Schema.makeFilter<Schema.Struct<{}>['Type']>(
  (value) =>
    Predicate.isObject(value) &&
    isPlainPrototype(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === 0
      ? undefined
      : 'an object with no properties',
  { expected: 'an object with no properties' },
);

/** The delivery row's id; the handler loads the address under its own role. */
export const InvitationDeliveryJobSchema = Schema.Struct({
  deliveryId: RowId,
});
export type InvitationDeliveryJob = typeof InvitationDeliveryJobSchema.Type;

/** The documented exception to identifiers-only — see JOB_PAYLOAD_POLICY. */
export const SignInEmailJobSchema = Schema.Struct({
  email: Schema.RedactedFromValue(Schema.String.check(Schema.isMinLength(1))),
  url: Schema.RedactedFromValue(Schema.String.check(isUrlString)),
});
export type SignInEmailJob = typeof SignInEmailJobSchema.Type;

export const SessionCompletedJobSchema = Schema.Struct({
  sessionId: RowId,
});
export type SessionCompletedJob = typeof SessionCompletedJobSchema.Type;

/** The sweep visits every tenant; there is nothing to address it at. */
export const ProtocolStoreGcJobSchema = Schema.Struct({}).check(isEmptyObject);
export type ProtocolStoreGcJob = typeof ProtocolStoreGcJobSchema.Type;

/** The run scans every suppressed window there is; nothing addresses it. */
export const DeniedAttemptsSummaryJobSchema = Schema.Struct({}).check(
  isEmptyObject,
);
export type DeniedAttemptsSummaryJob =
  typeof DeniedAttemptsSummaryJobSchema.Type;

/** The check reads one fixed manifest; there is nothing to address it at. */
export const UpdateCheckJobSchema = Schema.Struct({}).check(isEmptyObject);
export type UpdateCheckJob = typeof UpdateCheckJobSchema.Type;

const MintedId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/, {
    expected: 'an identifier Studio minted',
  }),
);

const OccurredAt = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));

const Count = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

export const USAGE_TEAM_ROLES = ['owner', 'admin', 'member'] as const;

const UsageTeamRole = Schema.Literals(USAGE_TEAM_ROLES);

const UsageTeamRoles = Schema.Array(UsageTeamRole).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(USAGE_TEAM_ROLES.length),
);

export const USAGE_PARTICIPATION_MODES = ['managed', 'anonymous'] as const;

type InterfaceType = CurrentProtocol['stages'][number]['type'];

const DECLARED_INTERFACE_TYPES = [
  'AlterEdgeForm',
  'AlterForm',
  'Anonymisation',
  'CategoricalBin',
  'DyadCensus',
  'EgoForm',
  'FamilyPedigree',
  'Geospatial',
  'Information',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'Narrative',
  'NarrativePedigree',
  'NetworkComposer',
  'OneToManyDyadCensus',
  'OrdinalBin',
  'Sociogram',
  'TieStrengthCensus',
] as const satisfies readonly InterfaceType[];

type UndeclaredInterfaceType = Exclude<
  InterfaceType,
  (typeof DECLARED_INTERFACE_TYPES)[number]
>;

export const INTERFACE_TYPES: [UndeclaredInterfaceType] extends [never]
  ? typeof DECLARED_INTERFACE_TYPES
  : never = DECLARED_INTERFACE_TYPES;

export const UsageInterfaceType = Schema.Literals(INTERFACE_TYPES);

const UsageInterfaceTypes = Schema.Array(UsageInterfaceType).check(
  Schema.isMaxLength(INTERFACE_TYPES.length),
);

const ResearcherFields = {
  occurredAt: OccurredAt,
  accountId: MintedId,
};

const TeamResearcherFields = {
  ...ResearcherFields,
  teamId: MintedId,
};

const InterviewFields = {
  occurredAt: OccurredAt,
  teamId: MintedId,
  sessionId: RowId,
  studyId: MintedId,
  waveId: MintedId,
};

export const ResearcherSignedUpEventSchema = Schema.Struct({
  event: Schema.Literal('researcher_signed_up'),
  ...ResearcherFields,
});

export const ResearcherSignedInEventSchema = Schema.Struct({
  event: Schema.Literal('researcher_signed_in'),
  ...ResearcherFields,
});

export const TeamInvitationSentEventSchema = Schema.Struct({
  event: Schema.Literal('team_invitation_sent'),
  ...TeamResearcherFields,
  invitationId: MintedId,
  role: UsageTeamRole,
});

export const TeamInvitationAcceptedEventSchema = Schema.Struct({
  event: Schema.Literal('team_invitation_accepted'),
  ...TeamResearcherFields,
  invitationId: MintedId,
  role: UsageTeamRole,
});

export const TeamMemberRoleChangedEventSchema = Schema.Struct({
  event: Schema.Literal('team_member_role_changed'),
  ...TeamResearcherFields,
  memberId: MintedId,
  previousRoles: UsageTeamRoles,
  newRoles: UsageTeamRoles,
});

export const StudyCreatedEventSchema = Schema.Struct({
  event: Schema.Literal('study_created'),
  ...TeamResearcherFields,
  studyId: MintedId,
  protocolId: MintedId,
  participationMode: Schema.Literals(USAGE_PARTICIPATION_MODES),
});

export const ProtocolCreatedEventSchema = Schema.Struct({
  event: Schema.Literal('protocol_created'),
  ...TeamResearcherFields,
  protocolId: MintedId,
});

export const ProtocolDraftCommittedEventSchema = Schema.Struct({
  event: Schema.Literal('protocol_draft_committed'),
  ...TeamResearcherFields,
  protocolId: MintedId,
  interfaceTypes: UsageInterfaceTypes,
  operationCount: Count,
});

export const InterviewStartedEventSchema = Schema.Struct({
  event: Schema.Literal('interview_started'),
  ...InterviewFields,
  resumed: Schema.Boolean,
});

export const InterviewCompletedEventSchema = Schema.Struct({
  event: Schema.Literal('interview_completed'),
  ...InterviewFields,
  nodeCount: Count,
  edgeCount: Count,
});

export const UsageEventSchema = Schema.Union([
  ResearcherSignedUpEventSchema,
  ResearcherSignedInEventSchema,
  TeamInvitationSentEventSchema,
  TeamInvitationAcceptedEventSchema,
  TeamMemberRoleChangedEventSchema,
  StudyCreatedEventSchema,
  ProtocolCreatedEventSchema,
  ProtocolDraftCommittedEventSchema,
  InterviewStartedEventSchema,
  InterviewCompletedEventSchema,
]);
export type UsageEvent = typeof UsageEventSchema.Type;

export const AnalyticsDeliveryJobSchema = Schema.Struct({
  usage: UsageEventSchema,
});
export type AnalyticsDeliveryJob = typeof AnalyticsDeliveryJobSchema.Type;

const TRACEPARENT =
  /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;

export const JobCorrelationSchema = Schema.Struct({
  traceparent: Schema.String.check(
    Schema.isPattern(TRACEPARENT, { expected: 'a W3C traceparent' }),
  ),
});
export type JobCorrelation = typeof JobCorrelationSchema.Type;

export const JOB_PAYLOAD_SCHEMAS = {
  'invitation-delivery': InvitationDeliveryJobSchema,
  // A dead-lettered job is a copy of the one that failed, so the shape is the
  // same one; nothing enqueues here directly.
  'invitation-delivery-dead-letter': InvitationDeliveryJobSchema,
  'sign-in-email': SignInEmailJobSchema,
  'protocol-store-gc': ProtocolStoreGcJobSchema,
  'denied-attempts-summary': DeniedAttemptsSummaryJobSchema,
  'update-check': UpdateCheckJobSchema,
  'session-completed': SessionCompletedJobSchema,
  'analytics-delivery': AnalyticsDeliveryJobSchema,
} as const satisfies Record<JobQueueName, Schema.Struct<Schema.Struct.Fields>>;

export type JobPayload<Queue extends JobQueueName> =
  (typeof JOB_PAYLOAD_SCHEMAS)[Queue]['Type'];

export type EncodedJobPayload<Queue extends JobQueueName> =
  (typeof JOB_PAYLOAD_SCHEMAS)[Queue]['Encoded'];

/**
 * `Schema.Struct` strips an undeclared key by default; a field the policy forbids
 * must be refused, not silently dropped.
 */
export const JOB_PAYLOAD_PARSE_OPTIONS = {
  onExcessProperty: 'error',
} as const satisfies SchemaAST.ParseOptions;

export type JobPayloadPolicy =
  | { kind: 'identifiers' }
  | { kind: 'usage-event'; reason: string }
  | { kind: 'exception'; reason: string };

/**
 * What a job on each queue is allowed to carry. `identifiers` means row ids
 * and nothing else: the job table is one table for every team, so a payload
 * that named a participant, an address or protocol content would put tenant
 * data somewhere row-level security does not reach, which is the objection
 * that kept Studio off a queue library until #1895.
 *
 * A queue added here declares its class, and the payload test refuses any
 * exception but the one below.
 */
export const JOB_PAYLOAD_POLICY = {
  'invitation-delivery': { kind: 'identifiers' },
  'invitation-delivery-dead-letter': { kind: 'identifiers' },
  'sign-in-email': {
    kind: 'exception',
    reason:
      'A magic link is minted by better-auth during the sign-in request and is never stored, so there is no row for the handler to load it back from. The address is the account being signed in to, which belongs to no team.',
  },
  'protocol-store-gc': { kind: 'identifiers' },
  'denied-attempts-summary': { kind: 'identifiers' },
  'update-check': { kind: 'identifiers' },
  'session-completed': { kind: 'identifiers' },
  'analytics-delivery': {
    kind: 'usage-event',
    reason:
      'The event is sent to Codaco as it was recorded, so a later change to the rows it names cannot change what was counted. It carries only what leaves the process: identifiers Studio minted, fixed codes defined in source, counts, booleans and a timestamp.',
  },
} as const satisfies Record<JobQueueName, JobPayloadPolicy>;
