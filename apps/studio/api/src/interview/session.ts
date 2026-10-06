import { Clock, Effect } from 'effect';

import { ParticipantSession } from '@codaco/studio-contract/middleware/session';
import {
  LinkUnavailable,
  SessionEnded,
} from '@codaco/studio-contract/schema/participant';

import { TenantScope } from '../db/tenant.ts';
import { networkFromRows } from '../network/mapping.ts';
import { readSessionNetwork } from '../network/session-network.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { sessionRefusal } from './availability.ts';
import { participantProtocolPayload } from './protocol.ts';
import { claimHolder, loadSessionContext } from './store.ts';

export const readParticipantSession = Effect.fn(
  'interview.readParticipantSession',
)(function* (holderId: string) {
  const session = yield* ParticipantSession;
  yield* enforceRateLimit('participant_session', session.sessionId);
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

      const holder = yield* claimHolder(session.sessionId, holderId);
      if (holder === null) {
        return yield* Effect.die(
          new Error(`session ${session.sessionId} vanished mid-claim`),
        );
      }
      const rows = yield* readSessionNetwork(session.sessionId);
      const protocol = yield* participantProtocolPayload({
        protocolId: context.protocolId,
        protocolVersionId: context.protocolVersionId,
        publishedAt: context.publishedAt,
      });

      return {
        studyId: context.studyId,
        holderEpoch: holder.holderEpoch,
        revision: String(context.clientRevision),
        stageIndex: context.stageIndex,
        stageId: context.stageId,
        session: {
          id: context.sessionId,
          startTime: context.startedAt.toISOString(),
          finishTime: null,
          exportTime: null,
          lastUpdated: context.lastActivityAt.toISOString(),
          network: networkFromRows({
            nodes: rows.nodes,
            edges: rows.edges,
            ego: {
              egoUid: context.egoUid,
              egoAttributes: context.egoAttributes,
              egoSecureAttributes: context.egoSecureAttributes,
            },
          }),
          stageMetadata: context.stageMetadata,
        },
        protocol,
      };
    }),
  );
});
