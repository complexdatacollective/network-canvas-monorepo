import { randomUUID } from 'node:crypto';

import {
  assert,
  describe,
  expect,
  it as vitestIt,
  layer,
} from '@effect/vitest';
import { DateTime, Duration, Effect, Exit, Layer, Logger } from 'effect';
import { TestClock } from 'effect/testing';

import { JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../../../__tests__/support/postgres.ts';
import { reachableRedis } from '../../../../__tests__/support/valkey.ts';
import {
  CLAIMED_SUFFIX,
  DeniedAuditRateLimiter,
} from '../../../../audit/denial-rate-limit.ts';
import { DENIED_SCOPE_COUNTS_KEY } from '../../../../rate-limit.ts';
import {
  createRateLimitStore,
  type RateLimitStore,
} from '../../../../rate-limit/store.ts';
import {
  DeliveryHarness,
  layerDeliveryHarness,
  layerWorker,
} from '../../__tests__/support.ts';
import { Database, withTransaction } from '../../database.ts';
import { causeError } from '../../errors.ts';
import { Jobs } from '../../jobs.ts';
import { resolvedQueue } from '../../queues.ts';
import { JobWorker, type HandledJob } from '../../worker.ts';
import { deniedAttemptsSummary } from '../denied-attempts-summary.ts';
import { DeniedAuditSummaryWriter } from '../denied-attempts/audit-writer.ts';
import {
  DeniedAttemptsStore,
  DeniedAttemptsStoreFailed,
} from '../denied-attempts/store.ts';
import {
  DeniedAttemptsMemory,
  layerMemoryStore,
  layerRecordingWriter,
  layerRefusingWriter,
  RecordedSummaries,
} from '../denied-attempts/testing.ts';

// `src/jobs/__tests__/denied-attempts-summary.test.ts`, ported to the native
// queue. The original file is untouched; this is a sibling, and every one of
// its cases is here in its order, followed by the branches of the handler the
// original never reached and the cases the port adds: the job run through
// `JobWorker`, and two against a real Valkey — one whole run, and the claim
// race the original ran.
//
// Two things differ from the original by construction. The store is the
// in-memory layer of `denied-attempts/testing.ts` rather than Valkey itself,
// so the cases run without one — the real-Valkey cases at the bottom are what
// hold the claim script and the limiter's key shape to each other. And the
// clock is `TestClock`: the original injected a `now()` to reach the recovery
// path — a claim whose write failed, retaken once it is stale — and virtual
// time reaches it with no seam in production code.

const db = await reachableDb();
/**
 * A logical database of this file's own, the way support/valkey.ts gives every
 * limiter suite one. Not in its `REDIS_DATABASES` map because that map is
 * shared with the pg-boss suites this file will replace: index 9 is the first
 * one free, and folding it in belongs to the stage-3 change that deletes the
 * original suite.
 */
const redisUrl = await reachableRedis(9);

const WINDOW_MS = 60_000;

/**
 * How far a case moves the clock on before it places its window. `TestClock`
 * is built with the suite's layer, so every case here shares one and it only
 * ever moves forward; each case takes a step of its own and works in the
 * coordinates that step leaves it in.
 *
 * Bounded on purpose. The clock walks every sleep scheduled between where it
 * is and where it is asked to go, one at a time, and the connection pool under
 * the SQL clients keeps a repeating one — a jump of years never finishes. Ten
 * minutes is enough to leave a closed window behind the clock and no more.
 */
const CASE_STEP = Duration.minutes(10);

const OPERATION = 'audit.read';

/** A later run, far enough past the claim's visibility timeout to retake one. */
const LATER = Duration.minutes(10);

const job = (): HandledJob<'denied-attempts-summary'> => ({
  id: randomUUID(),
  queue: 'denied-attempts-summary',
  payload: {},
  attempt: 1,
  // The queue declares no retries, so every attempt is the last one.
  finalAttempt: true,
});

type AuditRow = {
  readonly event_type: string;
  readonly outcome: string;
  readonly actor_id: string;
  readonly details: Record<string, unknown>;
};

/** A logger that keeps the lines, for the cases whose subject is one. */
const recordingLogger = (lines: string[]) =>
  Logger.layer([
    Logger.make<unknown, void>(({ message }) => {
      lines.push(String(message));
    }),
  ]);

describe('the summary queue declaration', () => {
  vitestIt('is a singleton on a one-minute schedule', () => {
    // Two runs at once would scan the same keys. The claim inside the job is
    // what makes a double write impossible; this is what makes a double run
    // unlikely in the first place, and it is the same policy the other
    // scanning job (protocol-store-gc) takes.
    expect(resolvedQueue('denied-attempts-summary').policy).toBe('singleton');
    expect(
      JOB_SCHEDULES.find(({ queue }) => queue === 'denied-attempts-summary'),
    ).toMatchObject({ cron: '* * * * *' });
  });
});

/** Studio's schema, the queue, the in-memory store and the real audit writer. */
const suiteLayer = Layer.mergeAll(
  layerMemoryStore,
  Layer.unwrap(
    Effect.map(DeliveryHarness, (harness) =>
      // The writer is the live one, over the scratch schema's maintenance
      // pool: the cases assert about rows in `audit_events`, so the write has
      // to be the real one. Only the cases about a write that fails replace it.
      DeniedAuditSummaryWriter.layer(harness.scratch.maintenance),
    ),
  ),
  Layer.unwrap(
    Effect.map(DeliveryHarness, (harness) =>
      Jobs.layer({ schema: harness.schema }),
    ),
  ),
).pipe(Layer.provideMerge(layerDeliveryHarness(db!)));

describe.skipIf(!db)(
  'the denied-attempts summary job on the native queue',
  () => {
    layer(suiteLayer)('with Studio and the queue installed', (it) => {
      /**
       * Where a case starts: the clock moved on by a step of its own, and the
       * two window boundaries that step implies.
       */
      const startCase = Effect.fnUntraced(function* () {
        yield* TestClock.adjust(CASE_STEP);
        const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
        return {
          nowMs,
          /**
           * A closed window, aligned to a window boundary. Far enough back
           * that the job will take it, and aligned because the cases place
           * their suppressed attempts a few seconds apart: from an unaligned
           * start those seconds could cross into the next minute, which is a
           * different key and a different window, and the case would be
           * asserting about two of them.
           */
          closedAt: Math.floor((nowMs - 5 * WINDOW_MS) / WINDOW_MS) * WINDOW_MS,
          /** The window the clock is inside, which cannot have ended. */
          liveAt: Math.floor(nowMs / WINDOW_MS) * WINDOW_MS,
        };
      });

      /** A team and an actor for one case, named so no two cases share either. */
      const seedActor = Effect.fnUntraced(function* (
        name = 'Denied Researcher',
      ) {
        const { scratch } = yield* DeliveryHarness;
        const teamId = `team-${randomUUID().slice(0, 8)}`;
        const actorId = `actor-${randomUUID().slice(0, 8)}`;
        yield* Effect.promise(async () => {
          await scratch.pool.query(
            `INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)
             ON CONFLICT (id) DO NOTHING`,
            [teamId],
          );
          await scratch.pool.query(
            `INSERT INTO "user" (id, name, email, "emailVerified")
             VALUES ($1, $2, $3, true)`,
            [actorId, name, `${actorId}@example.org`],
          );
        });
        return { teamId, actorId };
      });

      /**
       * The key a window for these three would have, built by the limiter that
       * writes it rather than restated here — `keyFor` needs no store.
       */
      const keyFor = (
        keyPrefix: string,
        input: { teamId: string; actorId: string; operation: string },
        windowStart: number,
      ) =>
        new DeniedAuditRateLimiter({
          keyPrefix,
          windowMs: WINDOW_MS,
          now: () => windowStart,
        }).keyFor(input);

      /**
       * A window of theirs that suppressed `count` attempts, as the limiter's
       * script leaves it: the two counters it keeps and the three fields the
       * summary is read out of.
       */
      const seedWindow = Effect.fnUntraced(function* (input: {
        keyPrefix: string;
        teamId: string;
        actorId: string;
        operation?: string;
        count: number;
        windowStart: number;
      }) {
        const memory = yield* DeniedAttemptsMemory;
        const operation = input.operation ?? OPERATION;
        const key = keyFor(
          input.keyPrefix,
          { teamId: input.teamId, actorId: input.actorId, operation },
          input.windowStart,
        );
        yield* memory.seed(key, {
          spent: '1',
          inflight: '0',
          suppressed: String(input.count),
          first: String(input.windowStart + 1_000),
          last: String(input.windowStart + 1_000 * input.count),
        });
        return key;
      });

      /**
       * The same burst `seedWindow` fabricates, made by the limiter itself
       * against a real Valkey: one admitted denial spends the window's
       * allowance of one, and the `count` attempts behind it are suppressed.
       * Answers the window's key.
       */
      const suppressInValkey = Effect.fnUntraced(function* (input: {
        store: RateLimitStore;
        keyPrefix: string;
        teamId: string;
        actorId: string;
        count: number;
        windowStart: number;
      }) {
        let clock = input.windowStart;
        const limiter = new DeniedAuditRateLimiter({
          store: input.store,
          limit: 1,
          windowMs: WINDOW_MS,
          keyPrefix: input.keyPrefix,
          now: () => clock,
        });
        const subject = {
          teamId: input.teamId,
          actorId: input.actorId,
          operation: OPERATION,
        };
        const admitted = yield* Effect.promise(() => limiter.reserve(subject));
        if (!admitted.admitted) throw new Error('expected an admission');
        yield* Effect.promise(() => admitted.complete('denied'));
        for (let attempt = 0; attempt < input.count; attempt += 1) {
          clock = input.windowStart + 1_000 * (attempt + 1);
          const refused = yield* Effect.promise(() => limiter.reserve(subject));
          assert.isFalse(refused.admitted);
        }
        return limiter.keyFor(subject);
      });

      /** A store open on this file's own logical Valkey database. */
      const openStore = Effect.acquireRelease(
        Effect.sync(() => createRateLimitStore(redisUrl!)),
        (open) => Effect.promise(() => open.close()),
      );

      /** One run of the job, as the maintenance role the worker runs as. */
      const runSummary = (keyPrefix: string) =>
        Effect.flatMap(DeliveryHarness, (harness) =>
          Effect.provideService(
            deniedAttemptsSummary({ keyPrefix, windowMs: WINDOW_MS })(job()),
            Database,
            harness.maintenance,
          ),
        );

      const summariesFor = Effect.fnUntraced(function* (teamId: string) {
        const { scratch } = yield* DeliveryHarness;
        return yield* Effect.promise(async () => {
          const { rows } = await scratch.pool.query<AuditRow>(
            `SELECT event_type, outcome, actor_id, details
               FROM audit_events WHERE team_id = $1`,
            [teamId],
          );
          return rows;
        });
      });

      /** The details of the one summary written for a team. */
      const onlySummary = Effect.fnUntraced(function* (teamId: string) {
        const rows = yield* summariesFor(teamId);
        assert.lengthOf(rows, 1);
        return rows[0]?.details ?? {};
      });

      // -------------------------------------------------------------- 1 ----
      it.effect('turns a suppressed burst into exactly one summary event', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId, actorId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          const key = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 12,
            windowStart: at.closedAt,
          });

          assert.strictEqual(yield* runSummary(keyPrefix), 'completed');

          assert.deepStrictEqual(yield* summariesFor(teamId), [
            {
              event_type: 'security.denied_attempts.rate_limited',
              outcome: 'denied',
              actor_id: actorId,
              details: {
                operation: OPERATION,
                suppressedCount: 12,
                firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
                lastSuppressedAt: new Date(at.closedAt + 12_000).toISOString(),
              },
            },
          ]);
          // The window is drained, so a second run has nothing to say about it.
          assert.isFalse(yield* memory.exists(key));
          assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          yield* runSummary(keyPrefix);
          assert.lengthOf(yield* summariesFor(teamId), 1);
        }),
      );

      // -------------------------------------------------------------- 2 ----
      it.effect('writes one event even when two workers run at once', () =>
        Effect.gen(function* () {
          // The claim is a read-and-rename in one store operation, so only the
          // run that got the contents can write them. The `singleton` policy
          // makes this rare; the claim makes it impossible.
          //
          // The two fibers really do interleave: every memory-store operation
          // yields before it runs (`denied-attempts/testing.ts`), so the
          // second fiber's scan and claim are scheduled between the first
          // fiber's, which is where two processes racing the Lua would meet.
          // Split the memory layer's `claimWindow` into a read and a write
          // with a yield between them and this case writes two events.
          const at = yield* startCase();
          const { teamId, actorId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 4,
            windowStart: at.closedAt,
          });

          yield* Effect.all([runSummary(keyPrefix), runSummary(keyPrefix)], {
            concurrency: 'unbounded',
          });

          assert.deepInclude(yield* onlySummary(teamId), {
            suppressedCount: 4,
          });
        }),
      );

      // -------------------------------------------------------------- 3 ----
      it.effect(
        'keeps the record when the audit write fails, and writes it once on the retry',
        () =>
          Effect.gen(function* () {
            // Deleting the window before the row is written — which is what
            // this did first — loses the summary outright if the write then
            // fails, with nothing left to retry from.
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              count: 6,
              windowStart: at.closedAt,
            });

            // A writer whose every call fails: the claim is taken, the write
            // is not. The run still completes — nothing retries this job.
            assert.strictEqual(
              yield* runSummary(keyPrefix).pipe(
                Effect.provide(layerRefusingWriter),
              ),
              'completed',
            );

            assert.deepStrictEqual(yield* summariesFor(teamId), []);
            // The window is gone, but its record is not: it is claimed,
            // waiting.
            assert.isFalse(yield* memory.exists(key));
            assert.isTrue(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));

            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.deepInclude(yield* onlySummary(teamId), {
              suppressedCount: 6,
            });
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));

            // And a third run, with the claim already gone, writes nothing
            // more.
            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);
          }),
      );

      // -------------------------------------------------------------- 4 ----
      it.effect(
        'writes one row when a claim is replayed after the row already exists',
        () =>
          Effect.gen(function* () {
            // The claim can outlive the write that succeeded. The next run
            // then re-reads the same record, and an audit event is immutable —
            // a second copy would be permanent.
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              count: 3,
              windowStart: at.closedAt,
            });
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);

            // Put the claim back, exactly as a failed discard would have left
            // it.
            yield* memory.seed(`${key}${CLAIMED_SUFFIX}`, {
              spent: '1',
              suppressed: '3',
              first: String(at.closedAt + 1_000),
              last: String(at.closedAt + 3_000),
            });

            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          }),
      );

      // -------------------------------------------------------------- 5 ----
      it.effect('leaves a window whose minute has not ended alone', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId, actorId } = yield* seedActor('Live Researcher');
          const keyPrefix = `test-summary-${randomUUID()}`;
          // Two windows in one run, because "left alone" has to be something
          // the handler chose rather than something that follows from it
          // never having run: a closed window it must summarise, and the
          // window the clock is inside, which cannot have ended whatever the
          // margin because its own minute is still running.
          const closedKey = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 2,
            windowStart: at.closedAt,
          });
          const liveKey = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 5,
            windowStart: at.liveAt,
          });

          yield* runSummary(keyPrefix);

          // The closed one, and only the closed one: one event, carrying the
          // closed window's first attempt rather than the live window's.
          assert.deepInclude(yield* onlySummary(teamId), {
            suppressedCount: 2,
            firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
          });
          assert.isFalse(yield* memory.exists(closedKey));

          // Nothing written and nothing taken for the live one: it is still
          // collecting, and summarising it now would report a burst that is
          // still happening. Its fields are exactly as the limiter left them
          // — no `claimedAt`, so it was never even claimed and rolled back.
          const live = yield* memory.read(liveKey);
          assert.isNotNull(live);
          assert.strictEqual(live?.get('suppressed'), '5');
          assert.isFalse(live?.has('claimedAt') ?? true);
          assert.isFalse(yield* memory.exists(`${liveKey}${CLAIMED_SUFFIX}`));
        }),
      );

      // -------------------------------------------------------------- 6 ----
      it.effect(
        'summarises the subject-free limiter scopes as one line each',
        () =>
          Effect.gen(function* () {
            // A refused sign-in is refused before anyone knows whose it was,
            // and a refused storage read belongs to no team. There is nowhere
            // to write an audit event, and the address is not something to
            // write anywhere — so the run says how many, per scope, and stops.
            yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            yield* memory.seed(DENIED_SCOPE_COUNTS_KEY, {
              sign_in_address: '7',
              storage_read: '3',
            });

            const lines: string[] = [];
            yield* runSummary(`test-summary-${randomUUID()}`).pipe(
              Effect.provide(recordingLogger(lines)),
            );

            assert.include(
              lines.join('\n'),
              'Rate limit refused 7 call(s) in scope sign_in_address.',
            );
            assert.include(
              lines.join('\n'),
              'Rate limit refused 3 call(s) in scope storage_read.',
            );
            // Drained, so the next run does not report the same refusals
            // again.
            assert.isFalse(yield* memory.exists(DENIED_SCOPE_COUNTS_KEY));
          }),
      );

      // The branches the original suite never reached ----------------------

      it.effect('completes and says so when no store is configured', () =>
        Effect.gen(function* () {
          yield* startCase();
          const lines: string[] = [];
          const outcome = yield* runSummary(
            `test-summary-${randomUUID()}`,
          ).pipe(
            Effect.provide(DeniedAttemptsStore.layerAbsent),
            Effect.provide(recordingLogger(lines)),
          );
          assert.strictEqual(outcome, 'completed');
          assert.include(lines.join('\n'), 'no rate limit store is configured');
        }),
      );

      it.effect(
        'discards a window whose operation this build does not know',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              operation: 'audit.invented-by-a-later-release',
              count: 5,
              windowStart: at.closedAt,
            });

            const recorded = yield* Effect.provide(
              Effect.gen(function* () {
                yield* runSummary(keyPrefix);
                return yield* RecordedSummaries;
              }),
              layerRecordingWriter,
            );

            // Dropped rather than written, because the event schema enumerates
            // the operation — and dropped for good, not left to be retried
            // forever.
            assert.lengthOf(recorded.written, 0);
            assert.deepStrictEqual(yield* summariesFor(teamId), []);
            assert.isFalse(yield* memory.exists(key));
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          }),
      );

      it.effect('discards a window whose actor no longer exists', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          // A team that exists and an actor that does not: the account was
          // deleted between the attempts and this run.
          const key = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId: `actor-${randomUUID().slice(0, 8)}`,
            count: 9,
            windowStart: at.closedAt,
          });

          const recorded = yield* Effect.provide(
            Effect.gen(function* () {
              yield* runSummary(keyPrefix);
              return yield* RecordedSummaries;
            }),
            layerRecordingWriter,
          );

          assert.lengthOf(recorded.written, 0);
          assert.deepStrictEqual(yield* summariesFor(teamId), []);
          assert.isFalse(yield* memory.exists(key));
          assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
        }),
      );

      it.effect('fails the job when the store itself rejects', () =>
        Effect.gen(function* () {
          // The store's own surface says it answers `UNAVAILABLE` rather than
          // rejecting. If that ever stops being true the run has to be seen,
          // rather than reporting a quiet zero.
          yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          yield* memory.failOn('drain');
          const exit = yield* Effect.exit(
            runSummary(`test-summary-${randomUUID()}`),
          );
          yield* memory.failOn(null);
          assert.isTrue(Exit.isFailure(exit));
          // The store's own error, naming the operation that rejected —
          // not merely "something failed", which any unrelated breakage in
          // this case would also satisfy.
          const failure = Exit.isFailure(exit) ? causeError(exit.cause) : null;
          if (!(failure instanceof DeniedAttemptsStoreFailed)) {
            throw new Error(
              `expected the store's own failure, got ${String(failure)}`,
            );
          }
          assert.strictEqual(failure._tag, 'DeniedAttemptsStoreFailed');
          assert.strictEqual(failure.operation, 'drain');
        }),
      );

      it.effect(
        'counts a summary it wrote even when the claim cannot be given up',
        () =>
          Effect.gen(function* () {
            // The event is in the log by the time the discard runs, so a
            // discard that fails must not un-report it: an operator reading
            // `summary events 0` for a minute that wrote one has been told the
            // opposite of what happened, and the next run — which finds the
            // row already there — reports zero too, so the write is never
            // counted anywhere.
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              count: 11,
              windowStart: at.closedAt,
            });

            const lines: string[] = [];
            yield* memory.failOn('del');
            const outcome = yield* runSummary(keyPrefix).pipe(
              Effect.provide(recordingLogger(lines)),
            );
            yield* memory.failOn(null);

            assert.strictEqual(outcome, 'completed');
            assert.deepInclude(yield* onlySummary(teamId), {
              suppressedCount: 11,
            });
            assert.include(
              lines.join('\n'),
              'attempt 1: summary events 1, limiter scopes 0',
            );
            assert.include(lines.join('\n'), 'stays claimed for a later run');
            // And the claim is still there, so a later run takes the window
            // again, finds the row already written, and only lets it go.
            assert.isTrue(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));

            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          }),
      );

      it.effect(
        'skips only the window whose write died, and summarises the rest',
        () =>
          Effect.gen(function* () {
            // A defect is not a window's problem alone if it escapes: the
            // original's `try`/`catch` skipped one window whatever went wrong
            // inside it, and catching only the typed failure would let one bad
            // window abandon every window behind it in the same pass.
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const first = yield* seedActor();
            const second = yield* seedActor('Second Researcher');
            const keyPrefix = `test-summary-${randomUUID()}`;
            const dyingKey = yield* seedWindow({
              keyPrefix,
              teamId: first.teamId,
              actorId: first.actorId,
              count: 2,
              windowStart: at.closedAt,
            });
            const nextKey = yield* seedWindow({
              keyPrefix,
              teamId: second.teamId,
              actorId: second.actorId,
              count: 7,
              windowStart: at.closedAt,
            });

            const lines: string[] = [];
            const recorded = yield* Effect.provide(
              Effect.gen(function* () {
                const writer = yield* RecordedSummaries;
                yield* writer.setBehaviour((_, call) =>
                  call === 1
                    ? Effect.die(new Error('the writer has a bug'))
                    : Effect.void,
                );
                const outcome = yield* runSummary(keyPrefix).pipe(
                  Effect.provide(recordingLogger(lines)),
                );
                assert.strictEqual(outcome, 'completed');
                return writer;
              }),
              layerRecordingWriter,
            );

            // Both windows were reached: the defect in the first did not end
            // the pass.
            assert.lengthOf(recorded.written, 2);
            assert.deepInclude(recorded.written[1], {
              teamId: second.teamId,
              summary: {
                suppressedCount: 7,
                firstSuppressedAt: at.closedAt + 1_000,
                lastSuppressedAt: at.closedAt + 7_000,
              },
            });
            // The one that died keeps its claim for a later run; the one that
            // was written gives its claim up, and only it is counted.
            assert.isTrue(yield* memory.exists(`${dyingKey}${CLAIMED_SUFFIX}`));
            assert.isFalse(yield* memory.exists(`${nextKey}${CLAIMED_SUFFIX}`));
            assert.include(lines.join('\n'), 'summary events 1');
            assert.include(lines.join('\n'), 'stays claimed for a later run');
          }),
      );

      it.effect('runs as a job the worker claims and settles', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId, actorId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          const key = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 8,
            windowStart: at.closedAt,
          });

          const step = yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            const jobs = yield* Jobs;
            yield* worker.work(
              'denied-attempts-summary',
              deniedAttemptsSummary({ keyPrefix, windowMs: WINDOW_MS }),
            );
            yield* withTransaction(jobs.enqueue('denied-attempts-summary', {}));
            return yield* worker.drainOnce('denied-attempts-summary');
          }).pipe(Effect.provide(layerWorker()));

          assert.strictEqual(step._tag, 'settled');
          assert.deepInclude(yield* onlySummary(teamId), {
            suppressedCount: 8,
          });
          assert.isFalse(yield* memory.exists(key));
        }),
      );

      // The same work against a real Valkey, which is what holds the claim
      // script and the limiter's key shape to each other: everything above
      // runs against a `Map` that honours the same semantics, and only this
      // case can tell that the semantics are the ones Valkey actually has.
      it.effect.skipIf(!redisUrl)(
        'summarises a window the limiter itself suppressed',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const { teamId, actorId } = yield* seedActor();
            const store = yield* openStore;
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* suppressInValkey({
              store,
              keyPrefix,
              teamId,
              actorId,
              count: 4,
              windowStart: at.closedAt,
            });

            const outcome = yield* runSummary(keyPrefix).pipe(
              Effect.provide(DeniedAttemptsStore.layer(store)),
            );
            assert.strictEqual(outcome, 'completed');

            assert.deepInclude(yield* onlySummary(teamId), {
              operation: OPERATION,
              suppressedCount: 4,
              firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
              lastSuppressedAt: new Date(at.closedAt + 4_000).toISOString(),
            });

            // Nothing of the window is left in the store: neither the window
            // nor the claim it was renamed to.
            const left = yield* Effect.promise(() =>
              store.run((redis) =>
                redis.exists(key, `${key}${CLAIMED_SUFFIX}`),
              ),
            );
            assert.strictEqual(left, 0);
          }),
      );

      // The concurrency case above races two fibers over a `Map`; this races
      // two runs over one Valkey, so the thing keeping the second run from
      // writing a second event is the claim script's own atomicity at the
      // server rather than a scheduling decision in this process. It is the
      // race the original suite ran, and the only one that can fail if
      // `CLAIM_SCRIPT` stops being a single execution.
      it.effect.skipIf(!redisUrl)(
        'writes one event when two runs race the same window at a real Valkey',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const { teamId, actorId } = yield* seedActor();
            const store = yield* openStore;
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* suppressInValkey({
              store,
              keyPrefix,
              teamId,
              actorId,
              count: 3,
              windowStart: at.closedAt,
            });

            yield* Effect.all([runSummary(keyPrefix), runSummary(keyPrefix)], {
              concurrency: 'unbounded',
            }).pipe(Effect.provide(DeniedAttemptsStore.layer(store)));

            assert.deepInclude(yield* onlySummary(teamId), {
              suppressedCount: 3,
              firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
            });
            const left = yield* Effect.promise(() =>
              store.run((redis) =>
                redis.exists(key, `${key}${CLAIMED_SUFFIX}`),
              ),
            );
            assert.strictEqual(left, 0);
          }),
      );
    });
  },
);
