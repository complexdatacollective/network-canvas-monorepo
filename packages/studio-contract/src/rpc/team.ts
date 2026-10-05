import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

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
