import { randomUUID } from 'node:crypto';

import { Effect, Layer } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

import {
  CLIENT_SESSION_HEADER,
  readClientSessionId,
} from '@codaco/studio-contract/client-session';

import type { WsBridgeDeps } from '../app.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { ClientSessionQuery } from './middleware/client-session-query.ts';
import { RequestId } from './middleware/request-id.ts';

/**
 * A pulled frame in the shape oRPC's adapter reads. It takes a string, an
 * `ArrayBuffer`, or a view over one; a socket reader yields strings and
 * `Uint8Array`s, and a `Uint8Array` is passed as a view rather than copied.
 * A view over a `SharedArrayBuffer` cannot arrive over a WebSocket, but it is
 * copied rather than refused if one ever does.
 */
function frameOf(
  frame: string | Uint8Array,
):
  | string
  | ArrayBuffer
  | Pick<Uint8Array<ArrayBuffer>, 'buffer' | 'byteOffset' | 'byteLength'> {
  if (typeof frame === 'string') return frame;
  const { buffer, byteLength, byteOffset } = frame;
  if (buffer instanceof ArrayBuffer) return { buffer, byteLength, byteOffset };
  const copy = new ArrayBuffer(byteLength);
  new Uint8Array(copy).set(frame);
  return copy;
}

// The app WebSocket endpoint. In development the Vite dev server proxies this
// path (with `ws: true`) alongside /api and /rpc, so the browser sees one
// origin in both topologies — the single-origin invariant from #1245.
const WS_PATH = '/ws';

/**
 * The upgrade, and the frames over it, as one route.
 *
 * The pull loop is inline rather than forked. A forked fiber would be a child
 * of the *request* scope, and the request scope closes as soon as the handler
 * returns its response — so a forked loop would be interrupted before the
 * first frame arrived. Staying inside the handler is what keeps the socket
 * alive: this effect does not finish until the socket does.
 */
export const WsBridge = (deps: WsBridgeDeps) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      // Read once, when the route is registered, rather than per request: the
      // registry is one per process and taking it here keeps it an ordinary
      // dependency of this layer instead of something every request has to be
      // handed.
      const drain = yield* WebSocketDrain;
      yield* router.add(
        'GET',
        WS_PATH,
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const requestId = yield* RequestId;

          // The guards are still the Hono middlewares they have always been, so
          // they are run over the handshake as a web request and their refusal is
          // answered as they wrote it.
          const handshake = yield* HttpServerRequest.toWeb(request);
          const admission = yield* Effect.promise(() => deps.admit(handshake));
          if ('refused' in admission) {
            return HttpServerResponse.fromWeb(admission.refused);
          }
          const { principal } = admission;

          const socket = yield* request.upgrade;
          // Registered for the duration of this request's scope, so a shutdown
          // waits for this socket to leave before it closes the listener.
          yield* drain.enter;
          const reader = yield* socket.reader;
          const writer = yield* socket.writer;

          // The socket is the presence identity, so it needs an id of its own.
          const connectionId = randomUUID();
          // The lock owner is the tab, which outlives its sockets: a client
          // that names nothing falls back to the connection and is its own
          // owner for as long as it is connected.
          //
          // Read from the header, not from the query string. A browser cannot
          // put a header on a WebSocket handshake, so the tab names itself on
          // the upgrade URL — and the route middleware below rewrites it into
          // the header before this runs, so both transports carry the id the
          // same way by the time anything reads it. The rewrite is also what
          // keeps "a parameter given twice names no tab" true here.
          //
          // Validated again even so. The middleware is authoritative for this
          // route, but the id is client-supplied and ends up in the
          // `leases.owner` column, so nothing downstream of here should depend
          // on a middleware having been provided to refuse an unbounded or
          // exotic string.
          const clientSessionId = readClientSessionId(
            request.headers[CLIENT_SESSION_HEADER],
          );
          const context = {
            principal,
            requestId,
            connectionId,
            clientSessionId,
          };

          // This request's services, so that a write oRPC asks for from its
          // own callback and a line logged about it go through the program's
          // loggers rather than a bare runtime's.
          const services = yield* Effect.context();

          // What oRPC sends a frame through. Nothing reads the write's result
          // — a send that fails is a socket that is already gone, which the
          // pull loop below is about to notice.
          const peer = {
            send: (data: string | Uint8Array<ArrayBuffer>) => {
              Effect.runForkWith(services)(writer.write(data));
            },
          };

          // oRPC keeps per-peer state (the calls in flight on this socket)
          // until it is told the peer is gone. A finalizer rather than a
          // statement after the loop, so it runs however this request ends —
          // a clean close, a dropped connection, or the interruption that
          // follows the drain's bound expiring.
          yield* Effect.addFinalizer(() =>
            Effect.tryPromise({
              try: () => deps.socket.close(peer),
              catch: (cause: unknown) => cause,
            }).pipe(
              Effect.catch((cause) =>
                Effect.logError('WebSocket peer close failed', cause),
              ),
            ),
          );
          const pump = Effect.flatMap(reader.pull, (frames) =>
            Effect.forEach(
              frames,
              (frame) =>
                Effect.sync(() => {
                  // Handed over before any await: the adapter's ordering
                  // guarantee is per message, in arrival order.
                  void deps.socket
                    .message(peer, frameOf(frame), { context })
                    .catch((error: unknown) => {
                      Effect.runForkWith(services)(
                        Effect.logError('WebSocket frame failed', error),
                      );
                    });
                }),
              { discard: true },
            ),
          );

          // Every termination of a socket — a clean close as much as a dropped
          // connection — fails the pull with a SocketError, so that is the loop's
          // normal exit rather than an error to report. The race is the other
          // exit: a shutdown signals `closing`, and a socket that is merely idle
          // would otherwise hold the process open until its peer noticed.
          yield* Effect.forever(pump).pipe(
            Effect.catchTag('SocketError', () => Effect.void),
            Effect.race(drain.closing),
          );

          return HttpServerResponse.empty();
        }),
      );
    }),
  ).pipe(
    // Provided rather than registered globally: moving the tab's id off the
    // query string is the `/ws` upgrade's own problem — `/rpc` is a fetch
    // request and carries the header itself.
    Layer.provide(ClientSessionQuery.layer),
  );
