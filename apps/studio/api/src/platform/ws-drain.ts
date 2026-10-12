import { Context, Effect, Latch, Layer, Ref, type Scope } from 'effect';
import { HttpServer } from 'effect/http';

/** How long a stop waits for open WebSockets to close, before the listener stops. */
export const DRAIN_TIMEOUT = '5 seconds';

export class WebSocketDrain extends Context.Service<
  WebSocketDrain,
  {
    readonly enter: Effect.Effect<void, never, Scope.Scope>;
    readonly closing: Effect.Effect<void>;
    readonly drain: Effect.Effect<void>;
    /** True from the moment a drain starts, so readiness can pull the replica. */
    readonly draining: Effect.Effect<boolean>;
  }
>()('@studio/WebSocketDrain') {
  static readonly layer: Layer.Layer<WebSocketDrain> = Layer.effect(
    WebSocketDrain,
    Effect.gen(function* () {
      const closing = yield* Latch.make(false);
      const drained = yield* Latch.make(false);
      const entered = yield* Ref.make(0);

      const leave = Effect.gen(function* () {
        const remaining = yield* Ref.updateAndGet(
          entered,
          (count) => count - 1,
        );
        if (remaining === 0 && closing.isOpen()) yield* drained.open;
      });

      const enter = Effect.gen(function* () {
        yield* Ref.update(entered, (count) => count + 1);
        yield* Effect.addFinalizer(() => leave);
      });

      const drain = Effect.gen(function* () {
        yield* closing.open;
        if ((yield* Ref.get(entered)) === 0) return;
        yield* drained.await.pipe(
          Effect.timeoutOrElse({
            duration: DRAIN_TIMEOUT,
            orElse: Effect.fnUntraced(function* () {
              const stuck = yield* Ref.get(entered);
              yield* Effect.logWarning(
                'Closing with WebSocket connections still open after the drain timeout.',
              ).pipe(
                Effect.annotateLogs({
                  open_connections: stuck,
                  drain_timeout: DRAIN_TIMEOUT,
                }),
              );
            }),
          }),
        );
      });

      return WebSocketDrain.of({
        enter,
        closing: closing.await,
        drain,
        draining: Effect.sync(() => closing.isOpen()),
      });
    }),
  );

  /**
   * Acquired by the program after `HttpRouter.serve`, so it releases before
   * the server detaches its handlers and closes.
   */
  static readonly layerShutdown: Layer.Layer<
    never,
    never,
    WebSocketDrain | HttpServer.HttpServer
  > = Layer.effectDiscard(
    Effect.gen(function* () {
      yield* HttpServer.HttpServer;
      const drain = yield* WebSocketDrain;
      yield* Effect.addFinalizer(() => drain.drain);
    }),
  );

  static readonly layerTest: Layer.Layer<WebSocketDrain> = Layer.succeed(
    WebSocketDrain,
    WebSocketDrain.of({
      enter: Effect.void,
      closing: Effect.never,
      drain: Effect.void,
      draining: Effect.succeed(false),
    }),
  );
}
