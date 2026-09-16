import { Context, Effect, Latch, Layer, Ref, type Scope } from 'effect';
import { HttpServer } from 'effect/unstable/http';

// Draining the app WebSocket on shutdown.
//
// A socket route is a fiber that lives as long as its connection, so a stop
// that only closed the listener would interrupt every open connection
// mid-frame. This registry gives those fibers a signal to finish on
// (`closing`) and gives the stop something to wait for: the count of fibers
// that entered and have not yet left.
//
// Two layers because the ordering matters in both directions. The registry is
// built BEFORE the routes, which take it as a dependency at registration time.
// The wait is a separate layer the program acquires AFTER
// `HttpRouter.serve(...)`, so it releases FIRST — before the server detaches
// its handlers and calls `server.close()`, which waits on upgraded sockets
// itself and would otherwise sit out its whole graceful window and then
// interrupt the very fibers this exists to drain.

/**
 * How long a stop waits for socket routes to finish. Shorter than the HTTP
 * server's own graceful window, which starts only once this has returned.
 */
const DRAIN_TIMEOUT = '5 seconds';

export class WebSocketDrain extends Context.Service<
  WebSocketDrain,
  {
    /** Registers the calling socket fiber until its scope closes. */
    readonly enter: Effect.Effect<void, never, Scope.Scope>;
    /** Completes once shutdown has been signalled. */
    readonly closing: Effect.Effect<void>;
    /**
     * What `layerShutdown`'s finalizer runs. On the service rather than
     * captured by that layer because the two layers share one instance:
     * `layerShutdown` requires this service and gets whichever one the program
     * provided.
     */
    readonly drain: Effect.Effect<void>;
  }
>()('@studio/WebSocketDrain') {
  /** The registry the `/ws` routes enter. No finalizer of its own. */
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
        // Nothing open is the ordinary case for a stop, and waiting on a latch
        // nothing will ever open would spend the whole bound on it.
        if ((yield* Ref.get(entered)) === 0) return;
        yield* drained.await.pipe(
          Effect.timeoutOrElse({
            duration: DRAIN_TIMEOUT,
            orElse: Effect.fnUntraced(function* () {
              const stuck = yield* Ref.get(entered);
              yield* Effect.logWarning(
                `Closing with ${stuck} WebSocket connection(s) still open after ${DRAIN_TIMEOUT}.`,
              );
            }),
          }),
        );
      });

      return WebSocketDrain.of({ enter, closing: closing.await, drain });
    }),
  );

  /**
   * Acquired by the program after `HttpRouter.serve`, so it releases before
   * the server detaches its handlers and closes. `HttpServer` is required for
   * exactly that reason: this layer can only sit after the listener exists.
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

  /** For in-process handler tests: entering is a no-op, and nothing closes. */
  static readonly layerTest: Layer.Layer<WebSocketDrain> = Layer.succeed(
    WebSocketDrain,
    WebSocketDrain.of({
      enter: Effect.void,
      closing: Effect.never,
      drain: Effect.void,
    }),
  );
}
