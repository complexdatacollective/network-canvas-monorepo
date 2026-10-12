import { Schema } from 'effect';

import { MemberId, TeamId, TeamInvitationId } from './ids.ts';
import { Email } from './primitives.ts';
import { problemFields } from './problem.ts';

export const TEAM_ROLES = ['owner', 'admin', 'member'] as const;
export const TeamRole = Schema.Literals(TEAM_ROLES);
export type TeamRole = (typeof TeamRole)['Type'];

const TeamName = Schema.RedactedFromValue(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(320)),
);

export const TeamScoped = Schema.Struct({
  teamId: TeamId,
});

export const UpdateTeamMemberRoleInput = Schema.Struct({
  ...TeamScoped.fields,
  memberId: MemberId,
  role: TeamRole,
});

export const UpdateTeamMemberRoleResult = Schema.Struct({
  memberId: MemberId,
  role: TeamRole,
});

export const CreateTeamInvitationInput = Schema.Struct({
  ...TeamScoped.fields,
  email: Email,
  role: TeamRole,
});

export const CreateTeamInvitationResult = Schema.Struct({
  invitationId: TeamInvitationId,
  email: Email,
  role: TeamRole,
  status: Schema.Literal('pending'),
  expiresAt: Schema.Date,
});

export const CancelTeamInvitationInput = Schema.Struct({
  ...TeamScoped.fields,
  invitationId: TeamInvitationId,
});

export const CancelTeamInvitationResult = Schema.Struct({
  invitationId: TeamInvitationId,
  status: Schema.Literal('canceled'),
});

export const AcceptTeamInvitationInput = Schema.Struct({
  invitationId: TeamInvitationId,
});

export const AcceptTeamInvitationResult = Schema.Struct({
  invitationId: TeamInvitationId,
  teamId: TeamId,
  teamName: TeamName,
  memberId: MemberId,
  role: TeamRole,
  status: Schema.Literal('accepted'),
});

export const TeamCommandErrorCode = Schema.Literals([
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'NO_CHANGE',
  'LAST_OWNER',
  'INVALID_ROLE',
  'DELIVERY_IN_PROGRESS',
]);

export class TeamCommandError extends Schema.TaggedError<TeamCommandError>()(
  'TeamCommandError',
  {
    ...problemFields('Team command refused', 409),
    code: TeamCommandErrorCode,
  },
  { httpApiStatus: 409 },
) {}
