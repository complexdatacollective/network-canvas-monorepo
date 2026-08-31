import { z } from 'zod';

import { TeamRoleSchema } from '@codaco/studio-rpc';

const LabelSchema = z.string().min(1).max(320);
const IdentifierSchema = z.string().min(1).max(255);

const CommonUserEventSchema = z.strictObject({
  teamId: IdentifierSchema,
  teamLabel: LabelSchema,
  eventVersion: z.literal(1),
  category: z.literal('team_access'),
  actorKind: z.literal('user'),
  actorId: IdentifierSchema,
  actorLabel: LabelSchema,
  requestId: z.uuid(),
  resourceType: z.null(),
  resourceId: z.null(),
  resourceLabel: z.null(),
});

const CommonSucceededEventSchema = CommonUserEventSchema.extend({
  outcome: z.literal('succeeded'),
}).strict();

const CommonDeniedEventSchema = CommonUserEventSchema.extend({
  outcome: z.literal('denied'),
}).strict();

const TeamMemberRoleChangedEventSchema = CommonSucceededEventSchema.extend({
  eventType: z.literal('team.member.role_changed'),
  subjectType: z.literal('team_member'),
  subjectId: IdentifierSchema,
  subjectLabel: LabelSchema,
  details: z.strictObject({
    previousRoles: z.array(TeamRoleSchema).min(1).max(3),
    newRoles: z.array(TeamRoleSchema).min(1).max(3),
  }),
}).strict();

const TeamInvitationCreatedEventSchema = CommonSucceededEventSchema.extend({
  eventType: z.literal('team.invitation.created'),
  subjectType: z.literal('team_invitation'),
  subjectId: IdentifierSchema,
  subjectLabel: z.email().max(320),
  details: z.strictObject({ role: TeamRoleSchema }),
}).strict();

const TeamInvitationCancelledEventSchema = CommonSucceededEventSchema.extend({
  eventType: z.literal('team.invitation.cancelled'),
  subjectType: z.literal('team_invitation'),
  subjectId: IdentifierSchema,
  subjectLabel: z.email().max(320),
  details: z.strictObject({ role: TeamRoleSchema }),
}).strict();

const TeamMemberRoleChangeDeniedEventSchema = CommonDeniedEventSchema.extend({
  eventType: z.literal('team.member.role_change_denied'),
  subjectType: z.literal('team_member'),
  subjectId: IdentifierSchema,
  subjectLabel: LabelSchema,
  details: z.strictObject({
    requestedRoles: z.array(TeamRoleSchema).min(1).max(3),
    reason: z.enum(['insufficient_permission', 'owner_role_requires_owner']),
  }),
}).strict();

export const AuditEventInputSchema = z.discriminatedUnion('eventType', [
  TeamMemberRoleChangedEventSchema,
  TeamMemberRoleChangeDeniedEventSchema,
  TeamInvitationCreatedEventSchema,
  TeamInvitationCancelledEventSchema,
]);

export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;
export type AuditEventType = AuditEventInput['eventType'];

type AuditEventDefinition = {
  title: string;
  detailFields: readonly string[];
  sensitiveFields: readonly string[];
  createsAlert: boolean;
  fixture: AuditEventInput;
};

const FIXTURE_COMMON = {
  teamId: 'fixture-team',
  teamLabel: 'Fixture team',
  eventVersion: 1,
  category: 'team_access',
  outcome: 'succeeded',
  actorKind: 'user',
  actorId: 'fixture-actor',
  actorLabel: 'Fixture actor',
  requestId: '00000000-0000-4000-8000-000000000001',
  resourceType: null,
  resourceId: null,
  resourceLabel: null,
} as const;

export const AUDIT_EVENT_REGISTRY = {
  'team.member.role_changed': {
    title: 'Member role changed',
    detailFields: ['previousRoles', 'newRoles'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_COMMON,
      eventType: 'team.member.role_changed',
      subjectType: 'team_member',
      subjectId: 'fixture-member',
      subjectLabel: 'Fixture member',
      details: { previousRoles: ['member'], newRoles: ['admin'] },
    },
  },
  'team.member.role_change_denied': {
    title: 'Member role change denied',
    detailFields: ['requestedRoles', 'reason'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_COMMON,
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
  'team.invitation.created': {
    title: 'Invitation created',
    detailFields: ['role'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_COMMON,
      eventType: 'team.invitation.created',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { role: 'member' },
    },
  },
  'team.invitation.cancelled': {
    title: 'Invitation cancelled',
    detailFields: ['role'],
    sensitiveFields: [],
    createsAlert: false,
    fixture: {
      ...FIXTURE_COMMON,
      eventType: 'team.invitation.cancelled',
      subjectType: 'team_invitation',
      subjectId: 'fixture-invitation',
      subjectLabel: 'invitee@example.com',
      details: { role: 'member' },
    },
  },
} as const satisfies Record<AuditEventType, AuditEventDefinition>;

export function parseAuditEventInput(input: unknown): AuditEventInput {
  return AuditEventInputSchema.parse(input);
}
