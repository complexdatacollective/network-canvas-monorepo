import { randomUUID } from 'node:crypto';

import { Duration, Effect, Layer, Option } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { Socket } from 'effect/unstable/socket';

import {
  CLIENT_SESSION_HEADER,
  readClientSessionId,
} from '@codaco/studio-contract/client-session';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';

import type { WsBridgeDeps } from '../app.ts';
import { Environment } from '../env.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { ClientSessionQuery } from './middleware/client-session-query.ts';
import { MaintenanceTriggers } from './middleware/maintenance.ts';
import { requireWsOrigin } from './middleware/origin.ts';
import { requirePrincipal } from './middleware/principal.ts';
import { httpRateLimit } from './middleware/rate-limit.ts';
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
 * How often an open socket asks whether the instance has closed. The reading
 * it asks is the gate's own cached one, at most a second old and shared by
 * every request, so a watch costs no database read of its own; a socket is
 * closed within about two seconds of the instance closing.
 */
const MAINTENANCE_WATCH_INTERVAL = Duration.seconds(1);

/**
 * The close a maintenance window sends an open socket: 1013, "Try Again
 * Later" in RFC 6455's registry — a temporary condition on the server's side,
 * which is what a window is. Not 1001 ("Going Away"), which is the endpoint
 * leaving, and not the codeless close a stopping process sends. The client's
 * transport reconnects whatever the code, and its reconnect meets the gate's
 * 503 until the window ends.
 */
const MAINTENANCE_CLOSE = new Socket.CloseEvent(1013, 'down for maintenance');

/**
 * The upgrade's guards, outermost first: the origin, then the principal, then
 * the per-user upgrade limit — after the principal, because its subject is the
 * user. What the limit stops is a reconnect loop becoming a connection storm:
 * a tab opens one socket and reopens it whenever the network drops. An
 * instance with no auth configured has no cookie to forge and no origin to
 * compare against, so it has no origin gate — and no session, so the
 * principal refuses every upgrade.
 *
 * Innermost, and so only for an admitted handshake, the tab's id moves off
 * the query string: that is the `/ws` upgrade's own problem — `/rpc` is a
 * fetch request and carries the header itself — so it is provided here rather
 * than registered globally.
 */
const wsGuards = Layer.unwrap(
  Effect.map(Environment, (env) => {
    const principal =
      env.auth === undefined
        ? requirePrincipal
        : requirePrincipal.combine(requireWsOrigin(env.auth.baseUrl));
    return ClientSessionQuery.combine(
      httpRateLimit(
        'ws_upgrade',
        Effect.map(Principal, ({ userId }) => userId),
      ).combine(principal),
    ).layer;
  }),
);

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
      const triggers = yield* MaintenanceTriggers;
      yield* router.add(
        'GET',
        WS_PATH,
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const requestId = yield* RequestId;
          // Resolved by the guards below, which have admitted the handshake by
          // the time this runs.
          const principal = yield* Principal;

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
          // the upgrade URL — and the route middleware above rewrites it into
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
          // The maintenance gate sees only the upgrade (#1901): a socket
          // opened before the window would otherwise go on running procedures
          // through it. So every batch of frames asks the gate's reading
          // before it is dispatched, and a batch that arrives while the
          // instance is closed is dropped and closes the socket. The close
          // ends the pull like any other, which is what ends the loop.
          //
          // Only the operator's window closes a socket. The gate's other two
          // triggers — a held migration lock and a stale schema — keep
          // refusing new requests and upgrades, but a `migrate` with nothing to
          // apply takes the lock for milliseconds on every deploy, and closing
          // every open editor over that would fail an in-flight edit for
          // nothing. A deploy that changes the schema enters the window first
          // (#1901), and that is what closes sockets.
          const operatorWindow = Effect.map(
            triggers.closure,
            Option.filter((closure) => closure.trigger === 'maintenance'),
          );
          const closeForMaintenance = writer
            .write(MAINTENANCE_CLOSE)
            .pipe(Effect.ignore);
          const pump = Effect.flatMap(reader.pull, (frames) =>
            Effect.flatMap(operatorWindow, (closure) =>
              Option.isSome(closure)
                ? closeForMaintenance
                : Effect.forEach(
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
            ),
          );
          // And a socket with nothing to send is closed too, rather than held
          // open through the window. The watch never finishes on its own: it
          // closes the socket and waits for the loop, which that close ends,
          // to win the race and interrupt it.
          const watchMaintenance = Effect.gen(function* () {
            while (Option.isNone(yield* operatorWindow)) {
              yield* Effect.sleep(MAINTENANCE_WATCH_INTERVAL);
            }
            yield* closeForMaintenance;
            return yield* Effect.never;
          });

          // Every termination of a socket — a clean close as much as a dropped
          // connection — fails the pull with a SocketError, so that is the loop's
          // normal exit rather than an error to report. The races are the other
          // exits: a shutdown signals `closing`, and a socket that is merely idle
          // would otherwise hold the process open until its peer noticed; the
          // maintenance watch only ever loses its race.
          yield* Effect.forever(pump).pipe(
            Effect.catchTag('SocketError', () => Effect.void),
            Effect.race(watchMaintenance),
            Effect.race(drain.closing),
          );

          return HttpServerResponse.empty();
        }),
      );
    }),
  ).pipe(Layer.provide(wsGuards));
