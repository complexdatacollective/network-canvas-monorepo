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
// Every command here declares `RateLimited`: the per-user and per-team call
// limits (#1909) are charged inside the handler that resolves the caller's
// team, and `Rpc.ToHandlerFn` types a handler's error channel from the rpc's
// OWN error schema rather than from `Rpc.ErrorSchema` — so a refusal the
// `Authenticated` middleware's schema would happily encode still has to be
// declared here for a handler to be able to raise it.
// `team.acceptInvitation` charges one more, per invitation token: it is the one
// command here an invitee reaches before the server knows anything about them
// beyond "signed in", so it is where a guessed token is throttled.

const TeamCommandErrors = Schema.Union([
  Forbidden,
  NotFound,
  Conflict,
  RateLimited,
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
