import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

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

// Team-scoped procedures: every input carries a teamId, checked against the
// caller's membership (`Forbidden` for non-members and unknown teams alike —
// no existence oracle).

// Every procedure here declares `RateLimited` as well as its own refusals. The
// per-user and per-team call limits (#1909) are charged inside the handlers
// that resolve the caller's team, not inside the `Authenticated` middleware, and
// `Rpc.ToHandlerFn` types a handler's error channel from the rpc's OWN error
// schema rather than from `Rpc.ErrorSchema` — which is what folds a middleware's
// errors in. So a refusal the middleware's schema would happily encode still has
// to be declared here for a handler to be able to raise it.
export const ProtocolsRpcs = RpcGroup.make(
  // The one admin-only procedure, so the one that declares the tier gate. A
  // line no study owns is reachable only by an Admin or Owner, so only they may
  // make one — and `TeamAdministration` resolves that before the handler runs,
  // handing it the `TeamAccess` it opens its transaction with.
  //
  // `.middleware(TeamAdministration)` comes BEFORE the group's
  // `.middleware(Authenticated)` below, and the order is load-bearing: the
  // middleware added last is the outermost and runs first, so `Authenticated`
  // has to be last for the principal to exist when this gate reads it
  // (`middleware/teamAdministration.ts`, `__tests__/ordering-probe.test.ts`).
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
