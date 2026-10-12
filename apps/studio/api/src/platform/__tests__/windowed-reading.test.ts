import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, MutableRef, Option } from 'effect';

import { windowedReading } from '../maintenance-state.ts';

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
