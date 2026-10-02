import { Schema, type SchemaAST } from 'effect';

import { Email } from '@codaco/studio-contract/schema/primitives';
import { StudyParticipationMode } from '@codaco/studio-contract/schema/study';
import { TeamRole } from '@codaco/studio-contract/schema/team';

/**
 * zod 4.5.4's `uuid()` pattern. `Schema.isUUID()` also admits the upper-case
 * max UUID that zod refused.
 */
const UUID_PATTERN =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

/**
 * zod 4.5.4's `datetime({ offset: true })` pattern; Effect 4 has no ISO
 * date-time string check to defer to.
 */
const OFFSET_DATETIME_PATTERN =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$/;

const Label = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(320),
);
const Identifier = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
);
const DecimalSequence = Schema.String.check(
  Schema.isPattern(/^(0|[1-9]\d*)$/),
  Schema.isMaxLength(20),
);
const RequestId = Schema.String.check(Schema.isPattern(UUID_PATTERN));
const OffsetDateTime = Schema.String.check(
  Schema.isPattern(OFFSET_DATETIME_PATTERN),
);
const PositiveInt = (max: number) =>
  Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(max),
  );
const TeamRoles = Schema.Array(TeamRole).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(3),
);

/**
 * An undeclared key must be refused, and `Schema.Struct` strips one unless
 * decoded with this option.
 */
export const AUDIT_EVENT_PARSE_OPTIONS = {
  onExcessProperty: 'error',
} as const satisfies SchemaAST.ParseOptions;

const CommonUserEventSchema = Schema.Struct({
  teamId: Identifier,
  teamLabel: Label,
  actorKind: Schema.Literal('user'),
  actorId: Identifier,
  actorLabel: Label,
  requestId: RequestId,
});

const CommonTeamAccessV1EventSchema = Schema.Struct({
  ...CommonUserEventSchema.fields,
  eventVersion: Schema.Literal(1),
  category: Schema.Literal('team_access'),
  resourceType: Schema.Null,
  resourceId: Schema.Null,
  resourceLabel: Schema.Null,
});

const CommonTeamAccessSucceededV1EventSchema = Schema.Struct({
  ...CommonTeamAccessV1EventSchema.fields,
  outcome: Schema.Literal('succeeded'),
});

const CommonTeamAccessSucceededV2EventSchema = Schema.Struct({
  ...CommonUserEventSchema.fields,
  eventVersion: Schema.Literal(2),
  category: Schema.Literal('team_access'),
  outcome: Schema.Literal('succeeded'),
  resourceType: Schema.Null,
  resourceId: Schema.Null,
  resourceLabel: Schema.Null,
});

const CommonTeamAccessDeniedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessV1EventSchema.fields,
  outcome: Schema.Literal('denied'),
});

const CommonTeamAccessFailedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessV1EventSchema.fields,
  outcome: Schema.Literal('failed'),
});

const TeamMemberRoleChangedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessSucceededV1EventSchema.fields,
  eventType: Schema.Literal('team.member.role_changed'),
  subjectType: Schema.Literal('team_member'),
  subjectId: Identifier,
  subjectLabel: Label,
  details: Schema.Struct({
    previousRoles: TeamRoles,
    newRoles: TeamRoles,
  }),
});

const TeamInvitationCreatedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessSucceededV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.created'),
  subjectType: Schema.Literal('team_invitation'),
  subjectId: Identifier,
  subjectLabel: Email,
  details: Schema.Struct({ role: TeamRole }),
});

const TeamInvitationCreationDeniedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessDeniedV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.creation_denied'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
  details: Schema.Struct({
    requestedRole: TeamRole,
    reason: Schema.Literals([
      'insufficient_permission',
      'owner_role_requires_owner',
    ]),
  }),
});

const TeamInvitationCancelledV1EventSchema = Schema.Struct({
  ...CommonTeamAccessSucceededV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.cancelled'),
  subjectType: Schema.Literal('team_invitation'),
  subjectId: Identifier,
  subjectLabel: Email,
  details: Schema.Struct({ role: TeamRole }),
});

const TeamInvitationCancelledV2EventSchema = Schema.Struct({
  ...CommonTeamAccessSucceededV2EventSchema.fields,
  eventType: Schema.Literal('team.invitation.cancelled'),
  subjectType: Schema.Literal('team_invitation'),
  subjectId: Identifier,
  subjectLabel: Email,
  details: Schema.Struct({ roles: TeamRoles }),
});

const TeamInvitationCancellationDeniedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessDeniedV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.cancellation_denied'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
  details: Schema.Struct({
    reason: Schema.Literal('insufficient_permission'),
  }),
});

const TeamInvitationCancellationFailedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessFailedV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.cancellation_failed'),
  subjectType: Schema.Literal('team_invitation'),
  subjectId: Identifier,
  subjectLabel: Email,
  details: Schema.Struct({
    failureCode: Schema.Literal('delivery_in_progress'),
  }),
});

const TeamInvitationAcceptedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessSucceededV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.accepted'),
  subjectType: Schema.Literal('team_invitation'),
  subjectId: Identifier,
  subjectLabel: Email,
  details: Schema.Struct({
    role: TeamRole,
    memberId: Identifier,
  }),
});

const TeamInvitationAcceptanceDeniedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessDeniedV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.acceptance_denied'),
  subjectType: Schema.Literal('team_invitation'),
  subjectId: Identifier,
  subjectLabel: Email,
  details: Schema.Struct({
    reason: Schema.Literals([
      'email_mismatch',
      'email_unverified',
      'invitation_unavailable',
    ]),
  }),
});

const TeamInvitationAcceptanceFailedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessFailedV1EventSchema.fields,
  eventType: Schema.Literal('team.invitation.acceptance_failed'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
  details: Schema.Struct({
    failureCode: Schema.Literals(['invalid_role', 'conflict']),
  }),
});

const TeamMemberRoleChangeDeniedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessDeniedV1EventSchema.fields,
  eventType: Schema.Literal('team.member.role_change_denied'),
  subjectType: Schema.Literal('team_member'),
  subjectId: Identifier,
  subjectLabel: Label,
  details: Schema.Struct({
    requestedRoles: TeamRoles,
    reason: Schema.Literals([
      'insufficient_permission',
      'owner_role_requires_owner',
    ]),
  }),
});

const TeamMemberRoleChangeFailedV1EventSchema = Schema.Struct({
  ...CommonTeamAccessFailedV1EventSchema.fields,
  eventType: Schema.Literal('team.member.role_change_failed'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
  details: Schema.Struct({ failureCode: Schema.Literal('last_owner') }),
});

export const DENIED_AUDIT_OPERATIONS = [
  'audit.read',
  'studies.create',
  'team.acceptInvitation',
  'team.cancelInvitation',
  'team.createInvitation',
  'team.updateMemberRole',
] as const;
export type DeniedAuditOperation = (typeof DENIED_AUDIT_OPERATIONS)[number];

const AuditReadDeniedV1EventSchema = Schema.Struct({
  ...CommonUserEventSchema.fields,
  eventVersion: Schema.Literal(1),
  eventType: Schema.Literal('audit.read_denied'),
  category: Schema.Literal('audit'),
  outcome: Schema.Literal('denied'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
  resourceType: Schema.Null,
  resourceId: Schema.Null,
  resourceLabel: Schema.Null,
  details: Schema.Struct({
    procedure: Schema.Literals([
      'audit.list',
      'audit.get',
      'audit.filterOptions',
    ]),
    reason: Schema.Literal('insufficient_permission'),
  }),
});

const DeniedAttemptsRateLimitedV1EventSchema = Schema.Struct({
  ...CommonUserEventSchema.fields,
  eventVersion: Schema.Literal(1),
  eventType: Schema.Literal('security.denied_attempts.rate_limited'),
  category: Schema.Literal('security'),
  outcome: Schema.Literal('denied'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
  resourceType: Schema.Null,
  resourceId: Schema.Null,
  resourceLabel: Schema.Null,
  details: Schema.Struct({
    operation: Schema.Literals(DENIED_AUDIT_OPERATIONS),
    suppressedCount: PositiveInt(Number.MAX_SAFE_INTEGER),
    firstSuppressedAt: OffsetDateTime,
    lastSuppressedAt: OffsetDateTime,
  }),
});

const ProtocolOperationType = Schema.Literals([
  'set',
  'unset',
  'insertItem',
  'removeItem',
  'moveItem',
  'addStage',
  'moveStage',
]);

const CommonProtocolSucceededV1EventSchema = Schema.Struct({
  ...CommonUserEventSchema.fields,
  eventVersion: Schema.Literal(1),
  category: Schema.Literal('protocol'),
  outcome: Schema.Literal('succeeded'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
  resourceType: Schema.Literal('protocol'),
  resourceId: Identifier,
  resourceLabel: Label,
});

const ProtocolCreatedV1EventSchema = Schema.Struct({
  ...CommonProtocolSucceededV1EventSchema.fields,
  eventType: Schema.Literal('protocol.created'),
  details: Schema.Struct({ draftId: Identifier }),
});

const ProtocolDraftCommittedV1EventSchema = Schema.Struct({
  ...CommonProtocolSucceededV1EventSchema.fields,
  eventType: Schema.Literal('protocol.draft.committed'),
  details: Schema.Struct({
    draftId: Identifier,
    revision: DecimalSequence,
    affectedSectionIds: Schema.Array(Identifier).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    operationTypes: Schema.Array(ProtocolOperationType).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(7),
    ),
    operationCount: PositiveInt(1_000),
  }),
});

// The study tier (#1262). Creating a study is a role-gated action (#1257), so
// both outcomes are recorded: the creation itself, and a refusal, which is
// what tells a team Admin that somebody without the role tried.
const CommonStudyV1EventSchema = Schema.Struct({
  ...CommonUserEventSchema.fields,
  eventVersion: Schema.Literal(1),
  category: Schema.Literal('study'),
  subjectType: Schema.Null,
  subjectId: Schema.Null,
  subjectLabel: Schema.Null,
});

const StudyCreatedV1EventSchema = Schema.Struct({
  ...CommonStudyV1EventSchema.fields,
  eventType: Schema.Literal('study.created'),
  outcome: Schema.Literal('succeeded'),
  resourceType: Schema.Literal('study'),
  resourceId: Identifier,
  resourceLabel: Label,
  details: Schema.Struct({
    protocolId: Identifier,
    draftId: Identifier,
    participationMode: StudyParticipationMode,
    // The grant the creator receives with the study, named so the role
    // history in this log is complete without reading the grants table.
    creatorRole: Schema.Literal('manager'),
  }),
});

const StudyCreationDeniedV1EventSchema = Schema.Struct({
  ...CommonStudyV1EventSchema.fields,
  eventType: Schema.Literal('study.creation_denied'),
  outcome: Schema.Literal('denied'),
  // No resource: the study was never created, so there is nothing to name.
  resourceType: Schema.Null,
  resourceId: Schema.Null,
  resourceLabel: Schema.Null,
  details: Schema.Struct({
    reason: Schema.Literal('insufficient_permission'),
  }),
});

// A plain union is intentional: eventType alone cannot remain the
// discriminator once two retained versions of the same immutable event exist.
export const AuditEventInputSchema = Schema.Union([
  AuditReadDeniedV1EventSchema,
  TeamMemberRoleChangedV1EventSchema,
  TeamMemberRoleChangeDeniedV1EventSchema,
  TeamMemberRoleChangeFailedV1EventSchema,
  DeniedAttemptsRateLimitedV1EventSchema,
  TeamInvitationCreatedV1EventSchema,
  TeamInvitationCreationDeniedV1EventSchema,
  TeamInvitationCancelledV1EventSchema,
  TeamInvitationCancelledV2EventSchema,
  TeamInvitationCancellationDeniedV1EventSchema,
  TeamInvitationCancellationFailedV1EventSchema,
  TeamInvitationAcceptedV1EventSchema,
  TeamInvitationAcceptanceDeniedV1EventSchema,
  TeamInvitationAcceptanceFailedV1EventSchema,
  ProtocolCreatedV1EventSchema,
  ProtocolDraftCommittedV1EventSchema,
  StudyCreatedV1EventSchema,
  StudyCreationDeniedV1EventSchema,
]);

export type AuditEventInput = typeof AuditEventInputSchema.Type;
type AuditEventKeyFor<Event extends AuditEventInput> =
  Event extends AuditEventInput
    ? `${Event['eventType']}@${Event['eventVersion']}`
    : never;
export type AuditEventKey = AuditEventKeyFor<AuditEventInput>;

type AuditEventDefinition = {
  inputSchema: Schema.Codec<AuditEventInput, unknown>;
  title: string;
  detailFields: readonly string[];
  sensitiveFields: readonly string[];
  createsAlert: boolean;
  fixture: AuditEventInput;
};

const FIXTURE_USER_COMMON = {
  teamId: 'fixture-team',
  teamLabel: 'Fixture team',
  actorKind: 'user',
  actorId: 'fixture-actor',
  actorLabel: 'Fixture actor',
  requestId: '00000000-0000-4000-8000-000000000001',
} as const;

const FIXTURE_TEAM_ACCESS_V1_COMMON = {
  ...FIXTURE_USER_COMMON,
  eventVersion: 1,
  category: 'team_access',
  outcome: 'succeeded',
  resourceType: null,
  resourceId: null,
  resourceLabel: null,
} as const;

const FIXTURE_TEAM_ACCESS_V2_COMMON = {
  ...FIXTURE_USER_COMMON,
  eventVersion: 2,
  category: 'team_access',
  outcome: 'succeeded',
  resourceType: null,
  resourceId: null,
  resourceLabel: null,
} as const;

const FIXTURE_PROTOCOL_V1_COMMON = {
  ...FIXTURE_USER_COMMON,
  eventVersion: 1,
  category: 'protocol',
  outcome: 'succeeded',
  subjectType: null,
  subjectId: null,
  subjectLabel: null,
  resourceType: 'protocol',
  resourceId: 'fixture-protocol',
  resourceLabel: 'Fixture protocol',
} as const;

const FIXTURE_STUDY_V1_COMMON = {
  ...FIXTURE_USER_COMMON,
  eventVersion: 1,
  category: 'study',
  subjectType: null,
  subjectId: null,
  subjectLabel: null,
} as const;

export const AUDIT_EVENT_REGISTRY = {
  'audit.read_denied@1': {
    inputSchema: AuditReadDeniedV1EventSchema,
    title: 'Activity log access denied',
    detailFields: ['procedure', 'reason'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_USER_COMMON,
      eventVersion: 1,
      eventType: 'audit.read_denied',
      category: 'audit',
      outcome: 'denied',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      details: { procedure: 'audit.list', reason: 'insufficient_permission' },
    },
  },
  'team.member.role_changed@1': {
    inputSchema: TeamMemberRoleChangedV1EventSchema,
    title: 'Member role changed',
    detailFields: ['previousRoles', 'newRoles'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      eventType: 'team.member.role_changed',
      subjectType: 'team_member',
      subjectId: 'fixture-member',
      subjectLabel: 'Fixture member',
      details: { previousRoles: ['member'], newRoles: ['admin'] },
    },
  },
  'team.member.role_change_denied@1': {
    inputSchema: TeamMemberRoleChangeDeniedV1EventSchema,
    title: 'Member role change denied',
    detailFields: ['requestedRoles', 'reason'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      outcome: 'denied',
      eventType: 'team.member.role_change_denied',
      subjectType: 'team_member',
      subjectId: 'fixture-member',
      subjectLabel: 'Fixture member',
      details: {
        requestedRoles: ['owner'],
        reason: 'owner_role_requires_owner',
      },
    },
  },
  'team.member.role_change_failed@1': {
    inputSchema: TeamMemberRoleChangeFailedV1EventSchema,
    title: 'Member role change failed',
    detailFields: ['failureCode'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      outcome: 'failed',
      eventType: 'team.member.role_change_failed',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      details: { failureCode: 'last_owner' },
    },
  },
  'security.denied_attempts.rate_limited@1': {
    inputSchema: DeniedAttemptsRateLimitedV1EventSchema,
    title: 'Denied attempts rate limited',
    detailFields: [
      'operation',
      'suppressedCount',
      'firstSuppressedAt',
      'lastSuppressedAt',
    ],
    sensitiveFields: [],
    createsAlert: true,
    fixture: {
      ...FIXTURE_USER_COMMON,
      eventVersion: 1,
      eventType: 'security.denied_attempts.rate_limited',
      category: 'security',
      outcome: 'denied',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      details: {
        operation: 'team.updateMemberRole',
        suppressedCount: 3,
        firstSuppressedAt: '2026-08-31T10:00:00.000Z',
        lastSuppressedAt: '2026-08-31T10:00:42.000Z',
      },
    },
  },
  'team.invitation.created@1': {
    inputSchema: TeamInvitationCreatedV1EventSchema,
    title: 'Invitation created',
    detailFields: ['role'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      eventType: 'team.invitation.created',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { role: 'member' },
    },
  },
  'team.invitation.creation_denied@1': {
    inputSchema: TeamInvitationCreationDeniedV1EventSchema,
    title: 'Invitation creation denied',
    detailFields: ['requestedRole', 'reason'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      outcome: 'denied',
      eventType: 'team.invitation.creation_denied',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      details: {
        requestedRole: 'owner',
        reason: 'owner_role_requires_owner',
      },
    },
  },
  'team.invitation.cancelled@1': {
    inputSchema: TeamInvitationCancelledV1EventSchema,
    title: 'Invitation cancelled',
    detailFields: ['role'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      eventType: 'team.invitation.cancelled',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { role: 'member' },
    },
  },
  'team.invitation.cancelled@2': {
    inputSchema: TeamInvitationCancelledV2EventSchema,
    title: 'Invitation cancelled',
    detailFields: ['roles'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V2_COMMON,
      eventType: 'team.invitation.cancelled',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { roles: ['admin', 'member'] },
    },
  },
  'team.invitation.cancellation_denied@1': {
    inputSchema: TeamInvitationCancellationDeniedV1EventSchema,
    title: 'Invitation cancellation denied',
    detailFields: ['reason'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      outcome: 'denied',
      eventType: 'team.invitation.cancellation_denied',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      details: { reason: 'insufficient_permission' },
    },
  },
  'team.invitation.cancellation_failed@1': {
    inputSchema: TeamInvitationCancellationFailedV1EventSchema,
    title: 'Invitation cancellation failed',
    detailFields: ['failureCode'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      outcome: 'failed',
      eventType: 'team.invitation.cancellation_failed',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { failureCode: 'delivery_in_progress' },
    },
  },
  'team.invitation.accepted@1': {
    inputSchema: TeamInvitationAcceptedV1EventSchema,
    title: 'Invitation accepted',
    detailFields: ['role', 'memberId'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      eventType: 'team.invitation.accepted',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { role: 'member', memberId: 'fixture-member' },
    },
  },
  'team.invitation.acceptance_denied@1': {
    inputSchema: TeamInvitationAcceptanceDeniedV1EventSchema,
    title: 'Invitation acceptance denied',
    detailFields: ['reason'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      outcome: 'denied',
      eventType: 'team.invitation.acceptance_denied',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { reason: 'email_mismatch' },
    },
  },
  'team.invitation.acceptance_failed@1': {
    inputSchema: TeamInvitationAcceptanceFailedV1EventSchema,
    title: 'Invitation acceptance failed',
    detailFields: ['failureCode'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_TEAM_ACCESS_V1_COMMON,
      outcome: 'failed',
      eventType: 'team.invitation.acceptance_failed',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      details: { failureCode: 'conflict' },
    },
  },
  'protocol.created@1': {
    inputSchema: ProtocolCreatedV1EventSchema,
    title: 'Protocol created',
    detailFields: ['draftId'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_PROTOCOL_V1_COMMON,
      eventType: 'protocol.created',
      details: { draftId: 'fixture-draft' },
    },
  },
  'protocol.draft.committed@1': {
    inputSchema: ProtocolDraftCommittedV1EventSchema,
    title: 'Protocol draft committed',
    detailFields: [
      'draftId',
      'revision',
      'affectedSectionIds',
      'operationTypes',
      'operationCount',
    ],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_PROTOCOL_V1_COMMON,
      eventType: 'protocol.draft.committed',
      details: {
        draftId: 'fixture-draft',
        revision: '2',
        affectedSectionIds: ['stage:fixture-stage'],
        operationTypes: ['set'],
        operationCount: 1,
      },
    },
  },
  'study.created@1': {
    inputSchema: StudyCreatedV1EventSchema,
    title: 'Study created',
    detailFields: ['protocolId', 'draftId', 'participationMode', 'creatorRole'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_STUDY_V1_COMMON,
      eventType: 'study.created',
      outcome: 'succeeded',
      resourceType: 'study',
      resourceId: 'fixture-study',
      resourceLabel: 'Fixture study',
      details: {
        protocolId: 'fixture-protocol',
        draftId: 'fixture-draft',
        participationMode: 'managed',
        creatorRole: 'manager',
      },
    },
  },
  'study.creation_denied@1': {
    inputSchema: StudyCreationDeniedV1EventSchema,
    title: 'Study creation denied',
    detailFields: ['reason'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_STUDY_V1_COMMON,
      eventType: 'study.creation_denied',
      outcome: 'denied',
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      details: { reason: 'insufficient_permission' },
    },
  },
} as const satisfies Record<AuditEventKey, AuditEventDefinition>;

export function auditEventKey(event: AuditEventInput): AuditEventKey {
  if (event.eventVersion === 2) {
    return 'team.invitation.cancelled@2';
  }
  return `${event.eventType}@1`;
}

export function auditEventDefinition(
  event: AuditEventInput,
): (typeof AUDIT_EVENT_REGISTRY)[AuditEventKey] {
  return AUDIT_EVENT_REGISTRY[auditEventKey(event)];
}

const decodeAuditEventIdentity = Schema.decodeUnknownSync(
  Schema.Struct({
    eventType: Schema.String,
    eventVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  }),
);

export function parseAuditEventInput(input: unknown): AuditEventInput {
  const identity = decodeAuditEventIdentity(input);
  const key = `${identity.eventType}@${identity.eventVersion}`;
  const definition = (
    AUDIT_EVENT_REGISTRY as Record<string, AuditEventDefinition>
  )[key];
  if (!definition) {
    throw new Error(`unregistered audit event definition: ${key}`);
  }
  return Schema.decodeUnknownSync(
    definition.inputSchema,
    AUDIT_EVENT_PARSE_OPTIONS,
  )(input);
}
