import { Clock, Effect, Redacted } from 'effect';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { ParticipantSession } from '@codaco/studio-contract/middleware/session';
import {
  type FinishInput,
  LinkUnavailable,
  SessionEnded,
  SessionOutOfDate,
  SessionTakenOver,
} from '@codaco/studio-contract/schema/participant';

import { auditedAs, changed } from '../audit/audited.ts';
import { Jobs } from '../jobs/jobs.ts';
import { networkFromRows, snapshotPayload } from '../network/mapping.ts';
import {
  insertSessionSnapshot,
  readSessionNetwork,
  refreshSessionNetworkProjections,
} from '../network/session-network.ts';
import { sessionRefusal } from './availability.ts';
import { completeSession, loadSessionContext } from './store.ts';

export const finishParticipantSession = Effect.fn(
  'interview.finishParticipantSession',
)(function* (input: typeof FinishInput.Type) {
  const session = yield* ParticipantSession;
  const actor = yield* AuditActor;
  const jobs = yield* Jobs;
  const now = new Date(yield* Clock.currentTimeMillis);

  return yield* auditedAs(
    'participant.finish',
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
      if (context.holderEpoch !== input.holderEpoch) {
        return yield* new SessionTakenOver({
          holderEpoch: context.holderEpoch,
        });
      }
      if (BigInt(input.revision) !== context.clientRevision) {
        return yield* new SessionOutOfDate({
          revision: String(context.clientRevision),
        });
      }

      const rows = yield* readSessionNetwork(session.sessionId);
      yield* refreshSessionNetworkProjections(session.sessionId);
      if (!(yield* completeSession(session.sessionId))) {
        return yield* Effect.die(
          new Error(`session ${session.sessionId} refused completion`),
        );
      }
      const snapshot = snapshotPayload({
        network: networkFromRows({
          nodes: rows.nodes,
          edges: rows.edges,
          ego: {
            egoUid: context.egoUid,
            egoAttributes: Redacted.value(context.egoAttributes),
            egoSecureAttributes: Redacted.value(context.egoSecureAttributes),
          },
        }),
        stageMetadata: Redacted.value(context.stageMetadata),
        currentStep: context.stageIndex,
      });
      yield* insertSessionSnapshot({
        sessionId: session.sessionId,
        studyId: context.studyId,
        protocolVersionId: context.protocolVersionId,
        schemaVersion: context.schemaVersion,
        payload: snapshot.payload,
        payloadHash: snapshot.payloadHash,
      });
      yield* jobs
        .enqueue('session-completed', { sessionId: session.sessionId })
        .pipe(Effect.catchTag('JobRefused', Effect.die));

      return {
        actor,
        result: changed({ state: 'completed' as const }, [
          {
            eventType: 'interview.completed',
            eventVersion: 1,
            category: 'participant_data',
            subjectType: context.participantId === null ? null : 'participant',
            subjectId: context.participantId,
            subjectLabel: context.participantCode,
            resourceType: 'interview_session',
            resourceId: session.sessionId,
            resourceLabel: null,
            details: {
              studyId: context.studyId,
              waveId: context.waveId,
              nodeCount: rows.nodes.length,
              edgeCount: rows.edges.length,
            },
          },
        ]),
      };
    }),
  );
});
