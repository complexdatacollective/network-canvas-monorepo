import { randomUUID } from 'node:crypto';

import { describe, expect, it } from '@effect/vitest';
import {
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Predicate,
  Schedule,
  Scope,
  Stream,
} from 'effect';
import { Redis } from 'ioredis';

import { readEnv } from '../env.ts';
import { resolve as resolveEnv } from '../env/resolve.ts';
import {
  Doorbell,
  doorbellCheck,
  makeMemoryDoorbell,
} from '../protocol-builder/doorbell.ts';
import { reachableDeniedAuditStore } from './support/valkey.ts';

// The shared Valkey is reached without `reachableRedis`, which flushes a
// database: pub/sub ignores the database number, so each test isolates itself
// on its own channel instead.
const url = (await reachableDeniedAuditStore()) ? readEnv().redis : undefined;

const WAIT = Duration.seconds(5);

const ADVANCED = { _tag: 'Advanced', draftId: 'draft-1', cursor: '7' } as const;

const PRESENCE = { _tag: 'Presence', draftId: 'draft-2' } as const;

const connectionName = () => `studio-doorbell-test-${randomUUID()}`;

const doorbellOn = (
  channel: string,
  name: string = connectionName(),
): Effect.Effect<Doorbell['Service'], never, Scope.Scope> =>
  Effect.gen(function* () {
    if (!url) return yield* Effect.die('unreachable: probe guaranteed Valkey');
    const context = yield* Layer.build(
      Doorbell.layerValkey({ url, channel, connectionName: name }),
    );
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

/** The first `Resync`, or the first message, subscribed before this returns. */
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

/** Drops only the named subscriber: other clients share this Valkey. */
const killSubscriber = Effect.fnUntraced(function* (
  redis: Redis,
  name: string,
) {
  const list = yield* Effect.promise(() =>
    redis.call('CLIENT', 'LIST', 'TYPE', 'pubsub'),
  );
  if (!Predicate.isString(list)) {
    return yield* Effect.die('CLIENT LIST did not answer with text');
  }
  const id = list
    .split('\n')
    .filter((line) => line.split(' ').includes(`name=${name}`))
    .map((line) => /(?:^| )id=(\d+)/.exec(line)?.[1])
    .find(Predicate.isString);
  if (id === undefined) return yield* Effect.die(`no subscriber named ${name}`);
  const killed = yield* Effect.promise(() =>
    redis.call('CLIENT', 'KILL', 'ID', id),
  );
  expect(killed).toBe(1);
});

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
      const name = connectionName();
      const a = yield* doorbellOn(on);
      const b = yield* doorbellOn(on, name);
      const redis = yield* admin;
      yield* until(b, true);

      const resync = yield* nextSignal(b, 'Resync');
      yield* killSubscriber(redis, name);

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

describe('a Valkey doorbell that cannot reach its server', () => {
  it.live('neither blocks a ring nor delays its own close', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const context = yield* Layer.buildWithScope(
        Doorbell.layerValkey({
          url: 'redis://127.0.0.1:1',
          channel: channel(),
        }),
        scope,
      );
      const doorbell = Context.get(context, Doorbell);
      const promptly = <A>(what: string, effect: Effect.Effect<A>) =>
        Effect.timeoutOrElse(effect, {
          duration: '300 millis',
          orElse: () => Effect.die(`${what} took longer than 300ms`),
        });

      yield* promptly('a ring', doorbell.ring(ADVANCED));
      expect(yield* doorbell.subscribed).toBe(false);
      yield* promptly('closing', Scope.close(scope, Exit.void));
    }),
  );

  it.live('reports readiness degraded, and only while one is configured', () =>
    Effect.gen(function* () {
      const env = resolveEnv({ NODE_ENV: 'test' });
      const doorbell = Context.get(
        yield* Layer.build(
          Doorbell.layerValkey({
            url: 'redis://127.0.0.1:1',
            channel: channel(),
          }),
        ),
        Doorbell,
      );
      expect(
        yield* doorbellCheck(
          { ...env, redis: 'redis://127.0.0.1:1' },
          doorbell,
        ),
      ).toBe('degraded');
      expect(
        yield* doorbellCheck(
          { ...env, redis: undefined },
          yield* memoryDoorbell,
        ),
      ).toBe('ok');
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

  it.effect('owes one Resync for the rings a stalled consumer missed', () =>
    Effect.gen(function* () {
      const doorbell = yield* makeMemoryDoorbell;
      const stalled = yield* doorbell.signals;
      for (let ring = 0; ring < 5_000; ring += 1) {
        yield* doorbell.ring(ADVANCED);
      }

      const draining = yield* Effect.forkChild(
        Stream.runCollect(
          Stream.takeUntil(stalled, (signal) => signal._tag === 'Presence'),
        ),
      );
      const received = yield* Effect.raceFirst(
        Fiber.join(draining),
        Effect.andThen(
          Effect.forever(
            Effect.andThen(doorbell.ring(PRESENCE), Effect.yieldNow),
          ),
          Effect.never,
        ),
      );

      const resyncs = received.filter((signal) => signal._tag === 'Resync');
      expect(resyncs).toHaveLength(1);
      expect(received.slice(-2)).toEqual([{ _tag: 'Resync' }, PRESENCE]);
      expect(received.length).toBeLessThan(5_000);
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
