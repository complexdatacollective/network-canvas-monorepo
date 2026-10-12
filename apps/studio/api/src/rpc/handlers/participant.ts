import { Effect, Schema } from 'effect';

import { ParticipantRpcs } from '@codaco/studio-contract/rpc/participant';
import {
  FinishResult,
  RedeemResult,
  SessionPayload,
  SyncResult,
} from '@codaco/studio-contract/schema/participant';

import { clientAddress } from '../../http/middleware/rate-limit.ts';
import { forwardParticipantEvents } from '../../interview/analytics.ts';
import { finishParticipantSession } from '../../interview/finish.ts';
import { redeemLink } from '../../interview/redeem.ts';
import { readParticipantSession } from '../../interview/session.ts';
import { syncParticipantSession } from '../../interview/sync.ts';
import { requireDatabase, withRequestId } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';

const decodeRedeemed = Schema.decodeUnknownSync(Schema.toType(RedeemResult));
const decodeSession = Schema.decodeUnknownSync(Schema.toType(SessionPayload));
const decodeSynced = Schema.decodeUnknownSync(SyncResult);
const decodeFinished = Schema.decodeUnknownSync(FinishResult);

export const ParticipantHandlers = (deps: RpcDeps) =>
  ParticipantRpcs.toLayer({
    'participant.redeem': (payload) =>
      Effect.gen(function* () {
        yield* requireDatabase(deps);
        const redeemed = yield* withRequestId(
          redeemLink(payload.linkToken, yield* clientAddress),
        ).pipe(Effect.catchTag('SqlError', Effect.die));
        return decodeRedeemed(redeemed);
      }),
    'participant.session': (payload) =>
      Effect.gen(function* () {
        yield* requireDatabase(deps);
        const session = yield* readParticipantSession(payload.holderId).pipe(
          Effect.catchTag('SqlError', Effect.die),
        );
        return decodeSession(session);
      }),
    'participant.sync': (payload) =>
      Effect.gen(function* () {
        yield* requireDatabase(deps);
        const synced = yield* syncParticipantSession(payload).pipe(
          Effect.catchTag('SqlError', Effect.die),
        );
        return decodeSynced(synced);
      }),
    'participant.finish': (payload) =>
      Effect.gen(function* () {
        yield* requireDatabase(deps);
        const finished = yield* withRequestId(
          finishParticipantSession(payload),
        ).pipe(
          Effect.catchTag('SqlError', Effect.die),
          Effect.catchTag('NotFound', Effect.die),
        );
        return decodeFinished(finished);
      }),
    'participant.analytics': (payload) =>
      Effect.gen(function* () {
        yield* requireDatabase(deps);
        yield* forwardParticipantEvents(payload).pipe(
          Effect.catchTag('SqlError', Effect.die),
        );
      }),
  });
