import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { RequireSession } from '../middleware/session.ts';
import { RateLimited, Unauthorized } from '../schema/errors.ts';
import {
  AnalyticsInput,
  FinishInput,
  FinishResult,
  FinishUnrecognised,
  LinkUnavailable,
  RedeemInput,
  RedeemResult,
  SessionEnded,
  SessionInput,
  SessionOutOfDate,
  SessionPayload,
  SessionTakenOver,
  SyncInput,
  SyncResult,
} from '../schema/participant.ts';

const redeem = Rpc.make('participant.redeem', {
  payload: RedeemInput,
  success: RedeemResult,
  error: Schema.Union([Unauthorized, LinkUnavailable, RateLimited]),
});

const session = Rpc.make('participant.session', {
  payload: SessionInput,
  success: SessionPayload,
  error: Schema.Union([
    SessionEnded,
    SessionTakenOver,
    LinkUnavailable,
    RateLimited,
  ]),
});

const sync = Rpc.make('participant.sync', {
  payload: SyncInput,
  success: SyncResult,
  error: Schema.Union([
    SessionEnded,
    SessionTakenOver,
    LinkUnavailable,
    RateLimited,
  ]),
});

const finish = Rpc.make('participant.finish', {
  payload: FinishInput,
  success: FinishResult,
  error: Schema.Union([
    SessionEnded,
    SessionTakenOver,
    SessionOutOfDate,
    FinishUnrecognised,
    LinkUnavailable,
  ]),
});

const analytics = Rpc.make('participant.analytics', {
  payload: AnalyticsInput,
  error: RateLimited,
});

// Two groups: `.middleware()` applies to every rpc added so far, and
// `participant.redeem` must stay session-free.
const ParticipantSessionRpcs = RpcGroup.make(
  session,
  sync,
  finish,
  analytics,
).middleware(RequireSession);
const ParticipantEntryRpcs = RpcGroup.make(redeem);

export const ParticipantRpcs =
  ParticipantSessionRpcs.merge(ParticipantEntryRpcs);
