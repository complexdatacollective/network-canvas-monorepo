import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';

import type { UsageEvent } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { knownInstallation } from '../../../platform/__tests__/support/installation.ts';
import {
  Analytics,
  participantDistinctId,
  RecordedAnalytics,
} from '../../../platform/analytics.ts';
import { InstallationIdentity } from '../../../platform/installation-identity.ts';
import { STUDIO_VERSION } from '../../../version.ts';
import {
  clearQueue,
  drainWith,
  enqueue as enqueueJob,
  layerJobs,
  layerQueueHarness,
  readJobs,
} from '../../__tests__/support.ts';
import { resolvedQueue } from '../../queues.ts';
import { analyticsDelivery } from '../analytics-delivery.ts';

const db = await reachableDb();

const INSTALLATION_ID = '1b4e28ba-2fa1-4d2e-8f3a-6b2c9d0e1f2a';

const OCCURRED_AT = Date.UTC(2026, 9, 8, 9, 30);

const SIGNED_IN = {
  event: 'researcher_signed_in' as const,
  occurredAt: OCCURRED_AT,
  accountId: 'k2Xh7pQ9mLw3Rt5Yv8Bn1Cz4Df6Gj0Hs',
} satisfies UsageEvent;

const STUDY_CREATED = {
  event: 'study_created' as const,
  occurredAt: OCCURRED_AT,
  accountId: 'k2Xh7pQ9mLw3Rt5Yv8Bn1Cz4Df6Gj0Hs',
  teamId: 'Tm4Qx8Wz2Lp6Rv0Ys3Nb7Kc1Hd5Jf9Ga',
  studyId: randomUUID(),
  protocolId: randomUUID(),
  participationMode: 'anonymous' as const,
} satisfies UsageEvent;

const INTERVIEW_STARTED = {
  event: 'interview_started' as const,
  occurredAt: OCCURRED_AT,
  teamId: 'Tm4Qx8Wz2Lp6Rv0Ys3Nb7Kc1Hd5Jf9Ga',
  sessionId: randomUUID(),
  studyId: randomUUID(),
  waveId: randomUUID(),
  resumed: false,
} satisfies UsageEvent;

const QUEUE = resolvedQueue('analytics-delivery');

const drain = drainWith('analytics-delivery', analyticsDelivery);

const captured = Effect.flatMap(
  RecordedAnalytics,
  (recorded) => recorded.captured,
);

const reset = Effect.gen(function* () {
  yield* clearQueue;
  const recorded = yield* RecordedAnalytics;
  yield* recorded.clear;
  yield* recorded.refuse(false);
});

describe.skipIf(!db)('the analytics delivery handler', () => {
  layer(
    Layer.mergeAll(
      layerQueueHarness(db!),
      Analytics.layerRecording,
      knownInstallation(INSTALLATION_ID),
    ),
  )('with the queue installed', (it) => {
    it.effect('sends a queued event once and completes the job', () =>
      Effect.gen(function* () {
        yield* reset;
        yield* enqueueJob('analytics-delivery', { usage: STUDY_CREATED });

        const step = yield* drain;
        assert.strictEqual(step._tag, 'settled');

        assert.deepStrictEqual(yield* captured, [
          {
            event: 'study_created',
            distinctId: STUDY_CREATED.accountId,
            timestamp: '2026-10-08T09:30:00.000Z',
            groups: { team: STUDY_CREATED.teamId },
            properties: {
              study_id: STUDY_CREATED.studyId,
              protocol_id: STUDY_CREATED.protocolId,
              participation_mode: 'anonymous',
              app: 'studio',
              $app_name: 'Network Canvas Studio',
              $app_version: STUDIO_VERSION,
              host_version: STUDIO_VERSION,
            },
          },
        ]);
        const [row] = yield* readJobs('analytics-delivery');
        assert.strictEqual(row?.state, 'completed');
        assert.strictEqual(row?.outcome, 'completed');
        assert.strictEqual((yield* drain)._tag, 'idle');
        assert.lengthOf(yield* captured, 1);
      }).pipe(Effect.provide(layerJobs)),
    );

    it.effect(
      'identifies the researcher by account id alongside a sign-in',
      () =>
        Effect.gen(function* () {
          yield* reset;
          yield* enqueueJob('analytics-delivery', { usage: SIGNED_IN });

          yield* drain;

          const sent = yield* captured;
          assert.deepStrictEqual(
            sent.map(({ event, distinctId, properties }) => ({
              event,
              distinctId,
              personProperties: Object.keys(properties).filter((key) =>
                key.startsWith('$set'),
              ),
            })),
            [
              {
                event: '$identify',
                distinctId: SIGNED_IN.accountId,
                personProperties: [],
              },
              {
                event: 'researcher_signed_in',
                distinctId: SIGNED_IN.accountId,
                personProperties: [],
              },
            ],
          );
        }).pipe(Effect.provide(layerJobs)),
    );

    it.effect(
      'sends an interview event as the session’s participant, with no person profile',
      () =>
        Effect.gen(function* () {
          yield* reset;
          yield* enqueueJob('analytics-delivery', {
            usage: INTERVIEW_STARTED,
          });

          yield* drain;

          const [sent] = yield* captured;
          assert.strictEqual(sent?.event, 'interview_started');
          assert.strictEqual(
            sent?.distinctId,
            participantDistinctId(INSTALLATION_ID, INTERVIEW_STARTED.sessionId),
          );
          assert.strictEqual(sent?.properties.$process_person_profile, false);
          assert.notInclude(JSON.stringify(sent), INTERVIEW_STARTED.sessionId);
        }).pipe(Effect.provide(layerJobs)),
    );

    it.effect(
      'keeps an event PostHog refused and sends it on a later attempt',
      () =>
        Effect.gen(function* () {
          yield* reset;
          const recorded = yield* RecordedAnalytics;
          yield* enqueueJob('analytics-delivery', { usage: STUDY_CREATED });
          yield* recorded.refuse(true);

          const first = yield* drain;
          assert.strictEqual(first._tag, 'retrying');
          assert.deepStrictEqual(yield* captured, []);
          const [waiting] = yield* readJobs('analytics-delivery');
          assert.strictEqual(waiting?.state, 'created');
          assert.strictEqual(waiting?.attempts, 1);
          assert.strictEqual(waiting?.retry_limit, QUEUE.retryLimit);

          yield* recorded.refuse(false);
          yield* TestClock.setTime(waiting!.run_at.getTime());
          const second = yield* drain;
          assert.strictEqual(second._tag, 'settled');
          assert.lengthOf(yield* captured, 1);
        }).pipe(Effect.provide(layerJobs)),
    );

    it.effect(
      'waits rather than sends while the installation id is unknown',
      () =>
        Effect.gen(function* () {
          yield* reset;
          yield* enqueueJob('analytics-delivery', { usage: STUDY_CREATED });

          const step = yield* drain.pipe(
            Effect.provide(Layer.fresh(InstallationIdentity.layer)),
          );
          assert.strictEqual(step._tag, 'retrying');
          assert.deepStrictEqual(yield* captured, []);
        }).pipe(Effect.provide(layerJobs)),
    );

    it.effect('sends nothing once telemetry is off in the worker', () =>
      Effect.gen(function* () {
        yield* reset;
        yield* enqueueJob('analytics-delivery', { usage: STUDY_CREATED });

        const step = yield* drain.pipe(Effect.provide(Analytics.layerDisabled));
        assert.strictEqual(step._tag, 'settled');
        assert.strictEqual(
          step._tag === 'settled' ? step.outcome : undefined,
          'suppressed',
        );
        assert.deepStrictEqual(yield* captured, []);
      }).pipe(Effect.provide(layerJobs)),
    );
  });
});
