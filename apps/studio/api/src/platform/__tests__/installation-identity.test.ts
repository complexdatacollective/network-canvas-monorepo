import { describe, expect, it } from '@effect/vitest';
import { Context, Duration, Effect, Layer, MutableRef, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { InstallationIdentity } from '../installation-identity.ts';

const resolvedIdentity = (read: Effect.Effect<string | null, unknown>) =>
  Effect.map(
    Layer.build(
      InstallationIdentity.resolvedBy(read).pipe(
        Layer.provideMerge(InstallationIdentity.layer),
      ),
    ),
    (context) => Context.get(context, InstallationIdentity),
  );

describe('InstallationIdentity', () => {
  it.effect('records the id as soon as the first read finds it', () =>
    Effect.gen(function* () {
      const identity = yield* resolvedIdentity(
        Effect.succeed('installation-1'),
      );
      yield* TestClock.adjust(Duration.millis(1));
      expect(identity.current()).toEqual(Option.some('installation-1'));
    }).pipe(Effect.scoped),
  );

  it.effect(
    'picks up a row created after boot within seconds, then stops reading',
    () =>
      Effect.gen(function* () {
        const row = MutableRef.make<string | null>(null);
        let reads = 0;
        const identity = yield* resolvedIdentity(
          Effect.sync(() => {
            reads += 1;
            return MutableRef.get(row);
          }),
        );
        yield* TestClock.adjust(Duration.seconds(1));
        expect(identity.current()).toEqual(Option.none());
        MutableRef.set(row, 'installation-1');
        yield* TestClock.adjust(Duration.seconds(4));
        expect(identity.current()).toEqual(Option.some('installation-1'));
        const settled = reads;
        yield* TestClock.adjust(Duration.minutes(5));
        expect(reads).toBe(settled);
      }).pipe(Effect.scoped),
  );

  it.effect(
    'keeps retrying, at most every thirty seconds, while the read fails',
    () =>
      Effect.gen(function* () {
        let reads = 0;
        yield* resolvedIdentity(
          Effect.suspend(() => {
            reads += 1;
            return Effect.fail(new Error('unreachable'));
          }),
        );
        yield* TestClock.adjust(Duration.minutes(2));
        const early = reads;
        yield* TestClock.adjust(Duration.minutes(5));
        expect(reads - early).toBeGreaterThanOrEqual(10);
        expect(reads - early).toBeLessThanOrEqual(11);
      }).pipe(Effect.scoped),
  );
});
