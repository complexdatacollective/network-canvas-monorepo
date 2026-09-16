import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { RequireSession } from '../middleware/session.ts';
import { RateLimited, Unauthorized } from '../schema/errors.ts';
import {
  FinishInput,
  FinishResult,
  LinkUnavailable,
  RedeemInput,
  RedeemResult,
  SessionEnded,
  SessionPayload,
  SessionTakenOver,
  SyncInput,
  SyncResult,
} from '../schema/participant.ts';

// The participant plane (#1899 shape). Declared, not merged into
// `StudioRpcs`: nothing in today's server can serve these four procedures, so
// `rpc/studio.ts` does not merge this group; #1899 merges it when its
// handlers land.

const redeem = Rpc.make('participant.redeem', {
  payload: RedeemInput,
  success: RedeemResult,
  error: Schema.Union([Unauthorized, LinkUnavailable, RateLimited]),
});

const session = Rpc.make('participant.session', {
  success: SessionPayload,
  error: Schema.Union([SessionEnded, SessionTakenOver]),
});

const sync = Rpc.make('participant.sync', {
  payload: SyncInput,
  success: SyncResult,
  error: Schema.Union([SessionEnded, SessionTakenOver, RateLimited]),
});

const finish = Rpc.make('participant.finish', {
  payload: FinishInput,
  success: FinishResult,
  error: Schema.Union([SessionEnded, SessionTakenOver]),
});

// Two groups, not one: `.middleware()` applies to every rpc added to the
// group so far, and `participant.redeem` — which spends a link before any
// session exists — must stay session-free.
const ParticipantSessionRpcs = RpcGroup.make(session, sync, finish).middleware(
  RequireSession,
);
const ParticipantEntryRpcs = RpcGroup.make(redeem);

export const ParticipantRpcs =
  ParticipantSessionRpcs.merge(ParticipantEntryRpcs);
