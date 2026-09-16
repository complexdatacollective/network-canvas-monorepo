import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Authenticated } from '../middleware/authenticated.ts';
import { Conflict, Forbidden, NotFound } from '../schema/errors.ts';
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

// Team-scoped procedures: every input carries a teamId, checked against the
// caller's membership (`Forbidden` for non-members and unknown teams alike —
// no existence oracle).
export const ProtocolsRpcs = RpcGroup.make(
  Rpc.make('protocols.create', {
    payload: CreateProtocolInput,
    success: CreateProtocolResult,
    error: Schema.Union([Forbidden, NotFound, ProtocolAuthorizationError]),
  }),
  Rpc.make('protocols.draft', {
    payload: ProtocolDraftInput,
    success: ProtocolDraft,
    error: Schema.Union([Forbidden, NotFound]),
  }),
  Rpc.make('protocols.list', {
    payload: TeamScoped,
    success: Schema.Array(ProtocolSummary),
    error: Forbidden,
  }),
  Rpc.make('protocols.addInformationStage', {
    payload: AddInformationStageInput,
    success: ManifestRevision,
    error: Schema.Union([
      Forbidden,
      NotFound,
      Conflict,
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
      ProtocolAuthorizationError,
    ]),
  }),
).middleware(Authenticated);
