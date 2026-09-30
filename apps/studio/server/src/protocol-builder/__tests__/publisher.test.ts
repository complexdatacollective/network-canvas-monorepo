import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Fiber, Scope, Stream } from 'effect';
import { TestClock } from 'effect/testing';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { LoggedProtocolEvent } from '../events.ts';
import { ProtocolEvents, SubscriberOverflow } from '../publisher.ts';

const SETTINGS = sectionId({ kind: 'settings' });

const event = (cursor: number): LoggedProtocolEvent => ({
  cursor: String(cursor),
  event: { type: 'lock', sectionId: SETTINGS },
});

const cursors = (entries: Iterable<LoggedProtocolEvent>) =>
  Array.from(entries, (entry) => Number(entry.cursor));

/**
 * Drains a stream that is expected to end, reporting what it delivered and how
 * it ended — or `undefined` for the exit if it was still running a second of
 * test time later.
 */
const drain = Effect.fnUntraced(function* (
  stream: Stream.Stream<LoggedProtocolEvent, SubscriberOverflow>,
) {
  const delivered: LoggedProtocolEvent[] = [];
  const fiber = yield* stream.pipe(
    Stream.runForEach((entry) => Effect.sync(() => delivered.push(entry))),
    Effect.forkChild,
  );
  yield* TestClock.adjust('1 second');
  const exit = fiber.pollUnsafe();
  yield* Fiber.interrupt(fiber);
  return { delivered, exit };
});

describe('ProtocolEvents', () => {
  // Mutation: remove the overflow detector (drop the `failCauseUnsafe`, or
  // subscribe with an unbounded queue) → the slow stream never ends.
  it.effect(
    'ends a subscriber past the bound without stalling the publisher or its peers',
    () =>
      Effect.gen(function* () {
        const events = yield* ProtocolEvents;
        const total = 5_000;
        const batch = 50;

        const slow = yield* events.subscribe('draft');
        const fast = yield* events.subscribe('draft');
        const received = yield* fast.pipe(
          Stream.take(total),
          Stream.runCollect,
          Effect.forkChild,
        );

        for (let start = 1; start <= total; start += batch) {
          yield* events.publish(
            'draft',
            Array.from({ length: batch }, (_, offset) => event(start + offset)),
          );
          yield* Effect.yieldNow;
        }

        expect(cursors(yield* Fiber.join(received))).toEqual(
          Array.from({ length: total }, (_, index) => index + 1),
        );

        const { delivered, exit } = yield* drain(slow);
        expect(delivered).toHaveLength(1024);
        expect(cursors(delivered).at(-1)).toBe(1024);
        expect(exit).toStrictEqual(
          Exit.fail(new SubscriberOverflow({ draftId: 'draft' })),
        );
      }).pipe(Effect.scoped, Effect.provide(ProtocolEvents.layer)),
  );

  it.effect('delivers nothing to a draft nobody subscribed to', () =>
    Effect.gen(function* () {
      const events = yield* ProtocolEvents;
      const other = yield* events.subscribe('other');
      yield* events.publish('draft', [event(1)]);
      yield* events.publish('other', [event(2)]);
      const received = yield* other.pipe(Stream.take(1), Stream.runCollect);
      expect(cursors(received)).toEqual([2]);
    }).pipe(Effect.scoped, Effect.provide(ProtocolEvents.layer)),
  );

  it.effect(
    'starts afresh once the last subscriber has left, with nothing stale',
    () =>
      Effect.gen(function* () {
        const events = yield* ProtocolEvents;

        const first = yield* Scope.make();
        const second = yield* Scope.make();
        const stale = yield* events
          .subscribe('draft')
          .pipe(Scope.provide(first));
        yield* events.subscribe('draft').pipe(Scope.provide(second));
        yield* events.publish('draft', [event(1), event(2)]);
        expect(yield* events.subscribers('draft')).toBe(2);
        yield* Scope.close(first, Exit.void);
        yield* Scope.close(second, Exit.void);
        // Mutation: never take a subscriber out of the fan-out → the draft
        // keeps both, and every later publish offers to their dead queues.
        expect(yield* events.subscribers('draft')).toBe(0);

        const ended = yield* drain(stale);
        expect(ended.exit?._tag).toBe('Failure');

        yield* events.publish('draft', [event(3)]);
        const fresh = yield* events.subscribe('draft');
        yield* events.publish('draft', [event(4)]);
        const received = yield* fresh.pipe(Stream.take(1), Stream.runCollect);
        expect(cursors(received)).toEqual([4]);
      }).pipe(Effect.scoped, Effect.provide(ProtocolEvents.layer)),
  );
});
