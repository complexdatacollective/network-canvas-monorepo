import { randomUUID } from 'node:crypto';

import { describe, expect, it } from '@effect/vitest';
import {
  Context,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Schedule,
  type Scope,
  Stream,
} from 'effect';
import { Redis } from 'ioredis';

import { readEnv } from '../env.ts';
import { Doorbell, makeMemoryDoorbell } from '../protocol-builder/doorbell.ts';
import { reachableDeniedAuditStore } from './support/valkey.ts';

// The shared Valkey is reached without `reachableRedis`, which flushes a
// database: pub/sub ignores the database number, so each test isolates itself
// on its own channel instead.
const url = (await reachableDeniedAuditStore()) ? readEnv().redis : undefined;

const WAIT = Duration.seconds(5);

const ADVANCED = { _tag: 'Advanced', draftId: 'draft-1', cursor: '7' } as const;

const PRESENCE = { _tag: 'Presence', draftId: 'draft-2' } as const;

const doorbellOn = (
  channel: string,
): Effect.Effect<Doorbell['Service'], never, Scope.Scope> =>
  Effect.gen(function* () {
    if (!url) return yield* Effect.die('unreachable: probe guaranteed Valkey');
    const context = yield* Layer.build(Doorbell.layerValkey({ url, channel }));
    return Context.get(context, Doorbell);
  });

const until = (
  doorbell: Doorbell['Service'],
  wanted: boolean,
): Effect.Effect<void> =>
  doorbell.subscribed.pipe(
    Effect.repeat({
      until: (subscribed) => subscribed === wanted,
      schedule: Schedule.spaced('5 millis'),
    }),
    Effect.timeoutOrElse({
      duration: WAIT,
      orElse: () => Effect.die(`subscribed never became ${wanted}`),
    }),
    Effect.asVoid,
  );

/** The first signal matching `tag`, subscribed before this returns. */
const nextSignal = Effect.fnUntraced(function* (
  doorbell: Doorbell['Service'],
  kind: 'Resync' | 'message',
) {
  const signals = yield* doorbell.signals;
  return yield* Effect.forkChild(
    signals.pipe(
      Stream.filter(
        (signal) => (signal._tag === 'Resync') === (kind === 'Resync'),
      ),
      Stream.runHead,
      Effect.flatMap(Effect.fromOption),
      Effect.orDie,
      Effect.timeoutOrElse({
        duration: WAIT,
        orElse: () => Effect.die(`no ${kind} signal arrived`),
      }),
    ),
  );
});

/** Rings until it is heard: the publisher's connection may not be ready yet. */
const ringUntilHeard = <A>(
  doorbell: Doorbell['Service'],
  heard: Fiber.Fiber<A>,
): Effect.Effect<A> =>
  Effect.raceFirst(
    Fiber.join(heard),
    Effect.andThen(
      Effect.repeat(doorbell.ring(ADVANCED), Schedule.spaced('50 millis')),
      Effect.never,
    ),
  );

const admin = Effect.acquireRelease(
  Effect.sync(() => {
    if (!url) throw new Error('unreachable: probe guaranteed Valkey');
    return new Redis(url, { connectionName: 'studio-doorbell-test' });
  }),
  (redis) => Effect.promise(() => redis.quit()),
);

const channel = () => `studio:protocol-events:${randomUUID()}`;

describe.skipIf(!url)('the Valkey doorbell', () => {
  it.live('carries a ring on one replica to another', () =>
    Effect.gen(function* () {
      const on = channel();
      const a = yield* doorbellOn(on);
      const b = yield* doorbellOn(on);
      yield* until(b, true);

      const heard = yield* nextSignal(b, 'message');
      expect(yield* ringUntilHeard(a, heard)).toEqual(ADVANCED);
    }).pipe(Effect.scoped),
  );

  it.live('resubscribes after the server drops it, and asks for a resync', () =>
    Effect.gen(function* () {
      const on = channel();
      const a = yield* doorbellOn(on);
      const b = yield* doorbellOn(on);
      const redis = yield* admin;
      yield* until(b, true);

      const resync = yield* nextSignal(b, 'Resync');
      yield* Effect.promise(() =>
        redis.call('CLIENT', 'KILL', 'TYPE', 'pubsub'),
      );

      yield* until(b, false);
      yield* until(b, true);
      expect(yield* Fiber.join(resync)).toEqual({ _tag: 'Resync' });

      const heard = yield* nextSignal(b, 'message');
      expect(yield* ringUntilHeard(a, heard)).toEqual(ADVANCED);
    }).pipe(Effect.scoped),
  );

  it.live('ignores a payload that is not a doorbell message', () =>
    Effect.gen(function* () {
      const on = channel();
      const b = yield* doorbellOn(on);
      const redis = yield* admin;
      yield* until(b, true);

      const heard = yield* nextSignal(b, 'message');
      yield* Effect.promise(async () => {
        await redis.publish(on, 'not json');
        await redis.publish(on, '{"_tag":"Advanced","draftId":"draft-1"}');
        await redis.publish(on, '{"_tag":"Unknown","draftId":"draft-1"}');
        await redis.publish(on, '{"_tag":"Presence","draftId":"draft-2"}');
      });

      expect(yield* Fiber.join(heard)).toEqual(PRESENCE);
    }).pipe(Effect.scoped),
  );
});

const memoryDoorbell = Effect.map(
  Layer.build(Doorbell.layerMemory),
  (context) => Context.get(context, Doorbell),
);

describe('the in-memory doorbell', () => {
  it.effect('fans a ring out to every subscriber of the shared hub', () =>
    Effect.gen(function* () {
      const shared = yield* makeMemoryDoorbell;
      const toFirst = yield* shared.signals;
      const toSecond = yield* shared.signals;

      yield* shared.ring(ADVANCED);
      yield* shared.ring(PRESENCE);

      expect(yield* Stream.runCollect(Stream.take(toFirst, 2))).toEqual([
        ADVANCED,
        PRESENCE,
      ]);
      expect(yield* Stream.runCollect(Stream.take(toSecond, 2))).toEqual([
        ADVANCED,
        PRESENCE,
      ]);
      expect(yield* shared.subscribed).toBe(true);
    }),
  );

  it.effect('gives each layer its own hub', () =>
    Effect.gen(function* () {
      const one = yield* memoryDoorbell;
      const other = yield* memoryDoorbell;
      const toOther = yield* other.signals;

      yield* one.ring(ADVANCED);
      yield* other.ring(PRESENCE);

      expect(yield* Stream.runHead(toOther)).toEqual(Option.some(PRESENCE));
    }),
  );
});
