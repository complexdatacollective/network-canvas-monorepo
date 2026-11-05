import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, MutableRef, Option } from 'effect';

import { observe } from '../../__tests__/support/observe.ts';
import { cachedReading, windowedReading } from '../maintenance-state.ts';

describe('a windowed reading', () => {
  it.effect(
    'joins the newer window’s read when a caller still holds an older window',
    () =>
      Effect.gen(function* () {
        const release = yield* Deferred.make<void>();
        const reads = MutableRef.make(0);
        // `window` answers the scripted values first, then the current one:
        // a caller that read its window just before the next one began.
        const current = MutableRef.make(1);
        const scripted: number[] = [];
        const reading = yield* windowedReading({
          name: 'the test value',
          read: Effect.suspend(() => {
            MutableRef.update(reads, (count) => count + 1);
            return Effect.as(Deferred.await(release), 'fresh');
          }),
          initial: 'initial',
          window: Effect.sync(
            () => scripted.shift() ?? MutableRef.get(current),
          ),
        });

        const first = yield* Effect.forkChild(reading);
        yield* Effect.yieldNow;
        scripted.push(0);
        const behind = yield* Effect.forkChild(reading);
        yield* Effect.yieldNow;
        assert.strictEqual(MutableRef.get(reads), 1);

        yield* Deferred.succeed(release, undefined);
        assert.deepStrictEqual(yield* Fiber.join(first), Option.some('fresh'));
        assert.deepStrictEqual(yield* Fiber.join(behind), Option.some('fresh'));
        assert.strictEqual(MutableRef.get(reads), 1);
      }),
  );
});

describe('a reading polled every second', () => {
  const read = Effect.as(Effect.withSpan(Effect.void, 'db.read'), 'fresh');

  it.effect('takes a cached reading without sampling its read', () => {
    const observed = observe();
    return Effect.gen(function* () {
      const reading = yield* cachedReading({
        name: 'the test value',
        read,
        initial: 'initial',
      });
      assert.strictEqual(yield* reading, 'fresh');
      const names = observed.spans.map((span) => span.name);
      assert.includeMembers(names, ['db.read']);
      assert.deepStrictEqual(
        observed.spans.filter((span) => span.sampled),
        [],
      );
    }).pipe(Effect.provide(observed.layer));
  });

  it.effect('takes a windowed reading without sampling its read', () => {
    const observed = observe();
    return Effect.gen(function* () {
      const reading = yield* windowedReading({
        name: 'the test value',
        read,
        initial: 'initial',
        window: Effect.succeed(1),
      });
      assert.deepStrictEqual(yield* reading, Option.some('fresh'));
      assert.includeMembers(
        observed.spans.map((span) => span.name),
        ['db.read'],
      );
      assert.deepStrictEqual(
        observed.spans.filter((span) => span.sampled),
        [],
      );
    }).pipe(Effect.provide(observed.layer));
  });
});
