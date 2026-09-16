import { Schema } from 'effect';

import { MemberId, TeamId, TeamInvitationId } from './ids.ts';
import { Email } from './primitives.ts';
import { problemFields } from './problem.ts';

// The team tier: who belongs to a team, in what role, and how an invitation
// travels from issue to acceptance.
//
// Input type == output type for every boundary schema here — no transforms,
// coercions, or divergent defaults — so one schema describes both what the
// server accepts and what the client receives. Declared result schemas are
// also the serialization allowlist: fields not named here are stripped before
// they reach the wire.

export const TEAM_ROLES = ['owner', 'admin', 'member'] as const;
export const TeamRole = Schema.Literals(TEAM_ROLES);
export type TeamRole = (typeof TeamRole)['Type'];

/** 1–320 characters, the bound the organization's name column carries. */
const TeamName = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(320),
);

// Every team-scoped procedure names its team explicitly — the authz input is
// never the session's active team (#1248: every route is team-scoped by
// construction).
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

// Acceptance deliberately has no teamId: the authenticated invitee is not a
// member yet, so the server resolves and locks the invitation's team instead
// of trusting a tenant chosen by the browser.
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

/**
 * Why a team command was refused, in the domain's own vocabulary rather than
 * the transport's. `DELIVERY_IN_PROGRESS` — an invitation whose email is
 * mid-send, which the caller can retry — is no longer flattened into
 * `CONFLICT` on the way out (design §5), so a client can tell it from a
 * genuine conflicting state without reading prose.
 */
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
