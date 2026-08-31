import { z } from 'zod';

import { TeamRoleSchema } from '@codaco/studio-rpc';

const LabelSchema = z.string().min(1).max(320);
const IdentifierSchema = z.string().min(1).max(255);
const DecimalSequenceSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(20);

const CommonUserEventSchema = z.strictObject({
  teamId: IdentifierSchema,
  teamLabel: LabelSchema,
  actorKind: z.literal('user'),
  actorId: IdentifierSchema,
  actorLabel: LabelSchema,
  requestId: z.uuid(),
});

const CommonTeamAccessV1EventSchema = CommonUserEventSchema.extend({
  eventVersion: z.literal(1),
  category: z.literal('team_access'),
  resourceType: z.null(),
  resourceId: z.null(),
  resourceLabel: z.null(),
}).strict();

const CommonTeamAccessSucceededV1EventSchema =
  CommonTeamAccessV1EventSchema.extend({
    outcome: z.literal('succeeded'),
  }).strict();

const CommonTeamAccessDeniedV1EventSchema =
  CommonTeamAccessV1EventSchema.extend({
    outcome: z.literal('denied'),
  }).strict();

const TeamMemberRoleChangedV1EventSchema =
  CommonTeamAccessSucceededV1EventSchema.extend({
    eventType: z.literal('team.member.role_changed'),
    subjectType: z.literal('team_member'),
    subjectId: IdentifierSchema,
    subjectLabel: LabelSchema,
    details: z.strictObject({
      previousRoles: z.array(TeamRoleSchema).min(1).max(3),
      newRoles: z.array(TeamRoleSchema).min(1).max(3),
    }),
  }).strict();

const TeamInvitationCreatedV1EventSchema =
  CommonTeamAccessSucceededV1EventSchema.extend({
    eventType: z.literal('team.invitation.created'),
    subjectType: z.literal('team_invitation'),
    subjectId: IdentifierSchema,
    subjectLabel: z.email().max(320),
    details: z.strictObject({ role: TeamRoleSchema }),
  }).strict();

const TeamInvitationCancelledV1EventSchema =
  CommonTeamAccessSucceededV1EventSchema.extend({
    eventType: z.literal('team.invitation.cancelled'),
    subjectType: z.literal('team_invitation'),
    subjectId: IdentifierSchema,
    subjectLabel: z.email().max(320),
    details: z.strictObject({ role: TeamRoleSchema }),
  }).strict();

const TeamMemberRoleChangeDeniedV1EventSchema =
  CommonTeamAccessDeniedV1EventSchema.extend({
    eventType: z.literal('team.member.role_change_denied'),
    subjectType: z.literal('team_member'),
    subjectId: IdentifierSchema,
    subjectLabel: LabelSchema,
    details: z.strictObject({
      requestedRoles: z.array(TeamRoleSchema).min(1).max(3),
      reason: z.enum(['insufficient_permission', 'owner_role_requires_owner']),
    }),
  }).strict();

const ProtocolOperationTypeSchema = z.enum([
  'set',
  'unset',
  'insertItem',
  'removeItem',
  'moveItem',
  'addStage',
  'moveStage',
]);

const CommonProtocolSucceededV1EventSchema = CommonUserEventSchema.extend({
  eventVersion: z.literal(1),
  category: z.literal('protocol'),
  outcome: z.literal('succeeded'),
  subjectType: z.null(),
  subjectId: z.null(),
  subjectLabel: z.null(),
  resourceType: z.literal('protocol'),
  resourceId: IdentifierSchema,
  resourceLabel: LabelSchema,
}).strict();

const ProtocolCreatedV1EventSchema =
  CommonProtocolSucceededV1EventSchema.extend({
    eventType: z.literal('protocol.created'),
    details: z.strictObject({ draftId: IdentifierSchema }),
  }).strict();

const ProtocolDraftCommittedV1EventSchema =
  CommonProtocolSucceededV1EventSchema.extend({
    eventType: z.literal('protocol.draft.committed'),
    details: z.strictObject({
      draftId: IdentifierSchema,
      revision: DecimalSequenceSchema,
      affectedSectionIds: z.array(IdentifierSchema).min(1).max(128),
      operationTypes: z.array(ProtocolOperationTypeSchema).min(1).max(7),
      operationCount: z.number().int().positive().max(1_000),
    }),
  }).strict();

// A plain union is intentional: eventType alone cannot remain the
// discriminator once two retained versions of the same immutable event exist.
export const AuditEventInputSchema = z.union([
  TeamMemberRoleChangedV1EventSchema,
  TeamMemberRoleChangeDeniedV1EventSchema,
  TeamInvitationCreatedV1EventSchema,
  TeamInvitationCancelledV1EventSchema,
  ProtocolCreatedV1EventSchema,
  ProtocolDraftCommittedV1EventSchema,
]);

export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;
export type AuditEventKey = AuditEventInput extends infer Event
  ? Event extends AuditEventInput
    ? `${Event['eventType']}@${Event['eventVersion']}`
    : never
  : never;

type AuditEventDefinition = {
  inputSchema: z.ZodType<AuditEventInput>;
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

export const AUDIT_EVENT_REGISTRY = {
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
} as const satisfies Record<AuditEventKey, AuditEventDefinition>;

export function auditEventKey(
  event: Pick<AuditEventInput, 'eventType' | 'eventVersion'>,
): AuditEventKey {
  return `${event.eventType}@${event.eventVersion}`;
}

export function auditEventDefinition(
  event: Pick<AuditEventInput, 'eventType' | 'eventVersion'>,
): (typeof AUDIT_EVENT_REGISTRY)[AuditEventKey] {
  return AUDIT_EVENT_REGISTRY[auditEventKey(event)];
}

export function parseAuditEventInput(input: unknown): AuditEventInput {
  const identity = z
    .object({
      eventType: z.string(),
      eventVersion: z.number().int().positive(),
    })
    .parse(input);
  const key = `${identity.eventType}@${identity.eventVersion}`;
  const definition = (
    AUDIT_EVENT_REGISTRY as Record<string, AuditEventDefinition>
  )[key];
  if (!definition) {
    throw new Error(`unregistered audit event definition: ${key}`);
  }
  return definition.inputSchema.parse(input);
}
