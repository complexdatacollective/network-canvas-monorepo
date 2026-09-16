import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import {
  Conflict,
  Forbidden,
  NotFound,
  RateLimited,
} from '../schema/errors.ts';
import {
  AcceptTeamInvitationInput,
  AcceptTeamInvitationResult,
  CancelTeamInvitationInput,
  CancelTeamInvitationResult,
  CreateTeamInvitationInput,
  CreateTeamInvitationResult,
  TeamCommandError,
  UpdateTeamMemberRoleInput,
  UpdateTeamMemberRoleResult,
} from '../schema/team.ts';

// Team membership and invitation commands. Every payload carries its teamId
// explicitly rather than trusting the session's active team (#1248: every
// route is team-scoped by construction), so a non-member and an unknown team
// are both `Forbidden` — no existence oracle.
//
// `team.acceptInvitation` alone also declares `RateLimited`: it is the one
// command here an invitee reaches before the server knows anything about
// them beyond "signed in", so it is where abuse is throttled per caller.

const TeamCommandErrors = Schema.Union([
  Forbidden,
  NotFound,
  Conflict,
  TeamCommandError,
]);

export const TeamRpcs = RpcGroup.make(
  Rpc.make('team.acceptInvitation', {
    payload: AcceptTeamInvitationInput,
    success: AcceptTeamInvitationResult,
    error: Schema.Union([
      Forbidden,
      NotFound,
      Conflict,
      RateLimited,
      TeamCommandError,
    ]),
  }),
  Rpc.make('team.updateMemberRole', {
    payload: UpdateTeamMemberRoleInput,
    success: UpdateTeamMemberRoleResult,
    error: TeamCommandErrors,
  }),
  Rpc.make('team.createInvitation', {
    payload: CreateTeamInvitationInput,
    success: CreateTeamInvitationResult,
    error: TeamCommandErrors,
  }),
  Rpc.make('team.cancelInvitation', {
    payload: CancelTeamInvitationInput,
    success: CancelTeamInvitationResult,
    error: TeamCommandErrors,
  }),
).middleware(Authenticated);
