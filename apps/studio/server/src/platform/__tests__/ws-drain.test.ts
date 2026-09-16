import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Exit, Fiber, Latch, Layer, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { HttpServer } from 'effect/unstable/http';
import { NetAddress } from 'effect/unstable/net';

import { WebSocketDrain } from '../ws-drain.ts';
import { collectLogs } from './support/logs.ts';

// The drain is a shutdown-ordering problem, so every case here is about when
// something happens rather than what: under the TestClock the five-second
// bound is a step rather than a wait, and the finalizer order is the whole
// reason `layerShutdown` is a layer of its own.

/** What the stand-in listener and the socket routes write, in arrival order. */
type Journal = {
  readonly entries: string[];
  readonly record: (what: string) => Effect.Effect<void>;
};

function journal(): Journal {
  const entries: string[] = [];
  return {
    entries,
    record: (what) =>
      Effect.sync(() => {
        entries.push(what);
      }),
  };
}

/**
 * Stands in for `NodeHttpServer.layer`: it provides the service
 * `layerShutdown` requires and records when its own finalizer runs, which is
 * the moment the real one detaches its handlers and closes the listener.
 */
const standInServer = (record: Journal['record']) =>
  Layer.effect(
    HttpServer.HttpServer,
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() => record('server-closed'));
      return HttpServer.make({
        serve: () => Effect.void,
        address: NetAddress.socketAddressFromInputUnsafe({
          address: '127.0.0.1',
          port: 0,
        }),
      });
    }),
  );

/**
 * The program's own composition: the registry first (the routes take it at
 * registration time), then the listener, then the wait — so the wait releases
 * before the listener closes.
 */
const build = Effect.fnUntraced(function* (record: Journal['record']) {
  const scope = yield* Scope.make();
  const context = yield* Layer.buildWithScope(
    WebSocketDrain.layerShutdown.pipe(
      Layer.provide(standInServer(record)),
      Layer.provideMerge(WebSocketDrain.layer),
    ),
    scope,
  );
  return {
    drain: Context.get(context, WebSocketDrain),
    close: Scope.close(scope, Exit.void),
  };
});

/** A fiber that has entered the drain and is parked inside its scope. */
const holdOpen = Effect.fnUntraced(function* (
  drain: WebSocketDrain['Service'],
) {
  const inside = yield* Latch.make(false);
  const held = yield* Effect.forkChild(
    Effect.scoped(
      Effect.gen(function* () {
        yield* drain.enter;
        yield* inside.open;
        yield* Effect.never;
      }),
    ),
  );
  yield* inside.await;
  return held;
});

describe('WebSocketDrain', () => {
  // Mutation: shorten DRAIN_TIMEOUT to '1 second' → the close has already
  // finished at the four-second mark and the pending assertion fails.
  // Mutation: delete the `logWarning` in `orElse` → the message is missing.
  it.effect(
    'waits the bound out for a fiber that never leaves, and says how many',
    () =>
      Effect.gen(function* () {
        const logs = collectLogs();
        const { record } = journal();

        yield* Effect.gen(function* () {
          const { drain, close } = yield* build(record);
          const held = yield* holdOpen(drain);

          const closing = yield* Effect.forkChild(close);
          yield* TestClock.adjust('4 seconds');
          expect(
            yield* Effect.sync(() => closing.pollUnsafe()),
          ).toBeUndefined();

          yield* TestClock.adjust('1 second');
          yield* Fiber.join(closing);
          yield* Fiber.interrupt(held);
        }).pipe(Effect.provide(logs.layer));

        expect(logs.messages).toContain(
          'Closing with 1 WebSocket connection(s) still open after 5 seconds.',
        );
      }),
  );

  // Mutation: delete the `drained.await` wait in `drain` → the listener's
  // finalizer runs before the route ever wakes, so the order inverts.
  it.effect('releases the routes before the listener closes', () =>
    Effect.gen(function* () {
      const { entries, record } = journal();
      const { drain, close } = yield* build(record);

      const inside = yield* Latch.make(false);
      yield* Effect.forkChild(
        Effect.scoped(
          Effect.gen(function* () {
            yield* drain.enter;
            yield* inside.open;
            yield* drain.closing;
            yield* record('route-exited');
          }),
        ),
      );
      yield* inside.await;

      yield* close;

      expect(entries).toEqual(['route-exited', 'server-closed']);
    }),
  );

  // Mutation: drop `closing.open` from `drain` → the waiter never completes
  // and `Fiber.join` below never returns.
  it.effect('completes `closing` when the scope closes', () =>
    Effect.gen(function* () {
      const { record } = journal();
      const { drain, close } = yield* build(record);

      const waiting = yield* Effect.forkChild(drain.closing);
      expect(yield* Effect.sync(() => waiting.pollUnsafe())).toBeUndefined();

      yield* close;
      yield* Fiber.join(waiting);
    }),
  );

  // Mutation: delete the `entered === 0` early return in `drain` → the close
  // suspends on a latch nothing will open, and never completes, because this
  // case deliberately makes no clock adjustment.
  it.effect('does not wait when nothing entered', () =>
    Effect.gen(function* () {
      const { entries, record } = journal();
      const { close } = yield* build(record);

      yield* close;

      expect(entries).toEqual(['server-closed']);
    }),
  );
});
