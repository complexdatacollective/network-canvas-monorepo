import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import { TeamAdministration } from '../middleware/teamAdministration.ts';
import {
  Conflict,
  Forbidden,
  NotFound,
  RateLimited,
} from '../schema/errors.ts';
import {
  AddInformationStageInput,
  CreateProtocolInput,
  CreateProtocolResult,
  ManifestRevision,
  MoveStageInput,
  ProtocolAuthorizationError,
  ProtocolDraft,
  ProtocolDraftInput,
  ProtocolSummary,
} from '../schema/protocol.ts';
import { TeamScoped } from '../schema/team.ts';

export const ProtocolsRpcs = RpcGroup.make(
  // `.middleware(TeamAdministration)` comes BEFORE the group's
  // `.middleware(Authenticated)`: the middleware added last runs first.
  Rpc.make('protocols.create', {
    payload: CreateProtocolInput,
    success: CreateProtocolResult,
    error: Schema.Union([
      Forbidden,
      NotFound,
      RateLimited,
      ProtocolAuthorizationError,
    ]),
  }).middleware(TeamAdministration),
  Rpc.make('protocols.draft', {
    payload: ProtocolDraftInput,
    success: ProtocolDraft,
    error: Schema.Union([Forbidden, NotFound, RateLimited]),
  }),
  Rpc.make('protocols.list', {
    payload: TeamScoped,
    success: Schema.Array(ProtocolSummary),
    error: Schema.Union([Forbidden, RateLimited]),
  }),
  Rpc.make('protocols.addInformationStage', {
    payload: AddInformationStageInput,
    success: ManifestRevision,
    error: Schema.Union([
      Forbidden,
      NotFound,
      Conflict,
      RateLimited,
      ProtocolAuthorizationError,
    ]),
  }),
  Rpc.make('protocols.moveStage', {
    payload: MoveStageInput,
    success: ManifestRevision,
    error: Schema.Union([
      Forbidden,
      NotFound,
      Conflict,
      RateLimited,
      ProtocolAuthorizationError,
    ]),
  }),
).middleware(Authenticated);
