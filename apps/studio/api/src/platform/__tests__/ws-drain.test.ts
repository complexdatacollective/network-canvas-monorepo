import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Exit, Fiber, Latch, Layer, Scope } from 'effect';
import { HttpServer } from 'effect/http';
import { NetAddress } from 'effect/net';
import { TestClock } from 'effect/testing';

import { WebSocketDrain } from '../ws-drain.ts';
import { collectLogs } from './support/logs.ts';

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

        expect(logs.records).toContainEqual(
          expect.objectContaining({
            message:
              'Closing with WebSocket connections still open after the drain timeout.',
            annotations: { open_connections: 1, drain_timeout: '5 seconds' },
          }),
        );
      }),
  );

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

  it.effect('reports draining from the moment a drain starts', () =>
    Effect.gen(function* () {
      const { record } = journal();
      const { drain, close } = yield* build(record);
      const held = yield* holdOpen(drain);

      expect(yield* drain.draining).toBe(false);

      const closing = yield* Effect.forkChild(close);
      yield* drain.closing;
      expect(yield* drain.draining).toBe(true);

      yield* Fiber.interrupt(held);
      yield* Fiber.join(closing);
    }),
  );

  it.effect('never reports draining from the test layer', () =>
    Effect.gen(function* () {
      const drain = yield* WebSocketDrain;
      yield* drain.drain;
      expect(yield* drain.draining).toBe(false);
    }).pipe(Effect.provide(WebSocketDrain.layerTest)),
  );

  it.effect('does not wait when nothing entered', () =>
    Effect.gen(function* () {
      const { entries, record } = journal();
      const { close } = yield* build(record);

      yield* close;

      expect(entries).toEqual(['server-closed']);
    }),
  );
});
