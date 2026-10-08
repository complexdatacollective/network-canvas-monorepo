import { Clock, Effect } from 'effect';

import { ParticipantSession } from '@codaco/studio-contract/middleware/session';
import {
  LinkUnavailable,
  SessionEnded,
  SessionTakenOver,
  type SyncInput,
} from '@codaco/studio-contract/schema/participant';

import { TenantScope } from '../db/tenant.ts';
import { egoColumns } from '../network/mapping.ts';
import { replaceSessionNetwork } from '../network/session-network.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { sessionRefusal } from './availability.ts';
import {
  advanceRevision,
  loadSessionContext,
  recordProgress,
} from './store.ts';

export const syncParticipantSession = Effect.fn(
  'interview.syncParticipantSession',
)(function* (input: typeof SyncInput.Type) {
  const session = yield* ParticipantSession;
  yield* enforceRateLimit('participant_sync', session.sessionId);
  const now = new Date(yield* Clock.currentTimeMillis);

  return yield* TenantScope.open(
    session.access,
    Effect.gen(function* () {
      const context = yield* loadSessionContext(session.sessionId, {
        lock: true,
      });
      if (context === null) {
        return yield* Effect.die(
          new Error(`session ${session.sessionId} vanished after resolving`),
        );
      }
      if (context.status !== 'in_progress') {
        return yield* new SessionEnded({ state: context.status });
      }
      const refusal = sessionRefusal(context, now);
      if (refusal !== null) {
        return yield* new LinkUnavailable({ state: refusal });
      }

      const outcome = yield* advanceRevision(session.sessionId, {
        holderEpoch: input.holderEpoch,
        revision: BigInt(input.revision),
      });
      switch (outcome._tag) {
        case 'Replayed':
          return { revision: String(outcome.revision), applied: false };
        case 'TakenOver':
          return yield* new SessionTakenOver({
            holderEpoch: outcome.holderEpoch,
          });
        case 'Ended':
          return yield* new SessionEnded({ state: outcome.status });
        case 'Missing':
          return yield* Effect.die(
            new Error(`session ${session.sessionId} vanished mid-sync`),
          );
        case 'Applied':
          break;
      }

      yield* replaceSessionNetwork({
        sessionId: session.sessionId,
        network: input.network,
      });
      yield* recordProgress(session.sessionId, {
        stageIndex: input.stageIndex,
        stageId: input.stageId,
        stageMetadata: input.stageMetadata,
        ego: egoColumns(input.network.ego),
      });
      return { revision: String(outcome.revision), applied: true };
    }),
  );
});
