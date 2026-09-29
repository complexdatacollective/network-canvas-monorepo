// The protocol-builder host's two mounts over one set of handlers.
//
// `/ws` is the editor's: a socket per tab, the one transport `WatchProtocol`
// can be held open over for as long as the protocol is. `/rpc/protocol-builder`
// is the unary plane (#1927 §20 Q2), for a script or a client whose network
// refuses WebSockets — the caller `IDLE_MS` exists for. Its own path because
// `/rpc` belongs to `StudioRpcs`, and the tags are flat.
//
// Both run the same handlers over the same per-process state, so a lock taken
// on one plane is renewed, refused and released exactly as one taken on the
// other.
import { randomUUID } from 'node:crypto';

import {
  ByteSize,
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
} from 'effect';
import * as HttpRouter from 'effect/unstable/http/HttpRouter';
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';
import * as Socket from 'effect/unstable/socket/Socket';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
import {
  MAX_SOCKET_FRAME_BYTES,
  MAX_UNARY_BODY_BYTES,
} from '@codaco/studio-contract/limits';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { WS_PATH } from '@codaco/studio-contract/rpc/studio';

import type { StudioEnv } from '../env.ts';
import { ClientSessionQuery } from '../http/middleware/client-session-query.ts';
import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import {
  requireSameOrigin,
  requireWsOrigin,
} from '../http/middleware/origin.ts';
import { requirePrincipal } from '../http/middleware/principal.ts';
import { httpRateLimit } from '../http/middleware/rate-limit.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { ProtocolBuilderHandlers } from './handlers.ts';
import { Leases } from './leases.ts';
import { Presence } from './presence.ts';
import { ProtocolEvents } from './publisher.ts';
import { StagedImports } from './resources.ts';
import { HostSessionLive, WsConnection } from './session.ts';

/** Where the unary plane is served. */
export const PROTOCOL_BUILDER_RPC_PATH = '/rpc/protocol-builder';

/**
 * Both servers run with fatal defects off. On by default, a handler that dies
 * sends a `Defect` frame, which the client treats as the end of every call on
 * the connection — so one call refused by the rate limiter, or one command
 * that hit a database fault, would take the socket's `WatchProtocol` down with
 * it. Off, it fails that call alone, which is what an internal error did
 * before.
 */
const SERVER_OPTIONS = {
  spanPrefix: 'protocolBuilder',
  disableFatalDefects: true,
} as const;

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
 * the query string: that is the `/ws` upgrade's own problem — a fetch request
 * carries the header itself — so it is provided here rather than registered
 * globally.
 */
const wsGuards = (env: StudioEnv) => {
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
};

/**
 * The request as the rpc server's upgrade sees it, with `upgrade` swapped for
 * one that hands back the gated socket.
 *
 * The websocket protocol upgrades the request it finds in its fiber and reads
 * the socket from there, so this is the one seam between the route and the
 * frames: every other member is the request's own.
 */
const withUpgrade = (
  request: HttpServerRequest.HttpServerRequest,
  upgrade: HttpServerRequest.HttpServerRequest['upgrade'],
): HttpServerRequest.HttpServerRequest =>
  new Proxy(request, {
    get: (target, property) =>
      property === 'upgrade' ? upgrade : Reflect.get(target, property, target),
  });

/**
 * The route for `/ws`: the guards above, then the socket registered with the
 * drain, then the rpc server's own upgrade — raced against the maintenance
 * watch and the drain's signal, either of which ends the socket.
 *
 * `RpcServer.layerHttp`'s websocket mount registers a route of its own and
 * leaves no room for either, so the route is built here around the protocol's
 * upgrade effect instead: one protocol and one server for every socket,
 * forked for the life of the layer, and a route per request that feeds its
 * socket to them.
 */
const WsRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const drain = yield* WebSocketDrain;
    const triggers = yield* MaintenanceTriggers;
    const upgradeToRpc = yield* RpcServer.toHttpEffectWebsocket(
      ProtocolBuilderGroup,
      SERVER_OPTIONS,
    );

    // Only the operator's window closes a socket. The gate's other two
    // triggers — a held migration lock and a stale schema — keep refusing new
    // requests and upgrades, but a `migrate` with nothing to apply takes the
    // lock for milliseconds on every deploy, and closing every open editor
    // over that would fail an in-flight edit for nothing. A deploy that
    // changes the schema enters the window first (#1901), and that is what
    // closes sockets.
    const operatorWindow = Effect.map(
      triggers.closure,
      Option.filter((closure) => closure.trigger === 'maintenance'),
    );

    const closeForMaintenance = (socket: Socket.Socket) =>
      Effect.flatMap(socket.writer, (writer) =>
        writer.write(MAINTENANCE_CLOSE),
      ).pipe(Effect.scoped, Effect.ignore);

    /**
     * The maintenance gate sees only the upgrade (#1901): a socket opened
     * before the window would otherwise go on running procedures through it.
     * So every batch of frames asks the gate's reading before the rpc server
     * is handed it, and a batch that arrives while the instance is closed is
     * dropped and closes the socket — the close the protocol ends a socket on.
     */
    const gated = (socket: Socket.Socket): Socket.Socket =>
      Socket.make({
        writer: socket.writer,
        reader: Effect.map(socket.reader, (reader) => ({
          upgrade: reader.upgrade,
          pull: Effect.flatMap(reader.pull, (frames) =>
            Effect.flatMap(operatorWindow, (closure) =>
              Option.isNone(closure)
                ? Effect.succeed(frames)
                : Effect.andThen(
                    closeForMaintenance(socket),
                    Effect.fail(
                      new Socket.SocketError({
                        reason: new Socket.SocketCloseError({
                          code: MAINTENANCE_CLOSE.code,
                          closeReason: MAINTENANCE_CLOSE.reason,
                        }),
                      }),
                    ),
                  ),
            ),
          ),
        })),
      });

    yield* router.add(
      'GET',
      WS_PATH,
      Effect.gen(function* () {
        // Registered for the duration of this request's scope, so a shutdown
        // waits for this socket to leave before it closes the listener.
        yield* drain.enter;
        const request = yield* HttpServerRequest.HttpServerRequest;
        const upgraded = yield* Deferred.make<Socket.Socket>();
        const upgrade = Effect.map(
          Effect.tap(request.upgrade, (socket) =>
            Deferred.succeed(upgraded, socket),
          ),
          gated,
        );

        // And a socket with nothing to send is closed too, rather than held
        // open through the window. The watch never finishes on its own: it
        // closes the socket and waits for the upgrade, which that close ends,
        // to win the race and interrupt it.
        const watchMaintenance = Effect.gen(function* () {
          while (Option.isNone(yield* operatorWindow)) {
            yield* Effect.sleep(MAINTENANCE_WATCH_INTERVAL);
          }
          yield* closeForMaintenance(yield* Deferred.await(upgraded));
          return yield* Effect.never;
        });

        // Every termination of a socket but a clean close — a dropped
        // connection, a failed read — ends the rpc server's read loop with a
        // socket defect, so that is the upgrade's normal exit rather than an
        // error to report. The races are the other exits: a shutdown signals
        // `closing`, and a socket that is merely idle would otherwise hold the
        // process open until its peer noticed; the maintenance watch only
        // ever loses its race. First to finish rather than first to succeed,
        // so a request that cannot be upgraded at all fails at once instead of
        // waiting on two races that never end.
        return yield* upgradeToRpc.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            withUpgrade(request, upgrade),
          ),
          Effect.provideService(WsConnection, {
            connectionId: `ws:${randomUUID()}`,
          }),
          Effect.catchDefect((defect) =>
            Predicate.isTagged(defect, 'SocketError')
              ? Effect.succeed(HttpServerResponse.empty())
              : Effect.die(defect),
          ),
          Effect.raceFirst(watchMaintenance),
          Effect.raceFirst(
            Effect.as(drain.closing, HttpServerResponse.empty()),
          ),
        );
      }),
    );
  }),
);

/**
 * `/ws`: one socket per editor tab, over `layerSchemaBinary` — the socket
 * frames the messages, and a staged asset crosses as its own bytes rather than
 * as base64 inside JSON, which a browser tab cannot afford at the upload bound
 * (#1936, the asset round trip measured on the stage PR). The frame bound is
 * the listener's own `maxPayload` (`platform/http-server.ts`), so an oversized
 * frame is refused by `ws` with a 1009 close before it reaches the parser,
 * which would otherwise be left unable to read another frame on that socket.
 */
const ProtocolBuilderWs = (env: StudioEnv) =>
  WsRoute.pipe(
    Layer.provide(
      RpcSerialization.layerSchemaBinary({
        maxFrameSize: MAX_SOCKET_FRAME_BYTES,
      }),
    ),
    Layer.provide(wsGuards(env)),
  );

/** The unary plane's request-body bound; a reference so a suite can shrink it. */
export const UnaryBodyLimit = Context.Reference<number>(
  '@studio/protocol-builder/UnaryBodyLimit',
  { defaultValue: () => MAX_UNARY_BODY_BYTES },
);

/**
 * The rpc server reads the whole body before any middleware of its own runs,
 * the principal's included, so the bound is set on the route. The Node
 * listener's request stops reading and destroys the connection once a body
 * crosses `MaxBodySize`.
 */
const boundedBody = HttpRouter.middleware(
  Effect.map(
    UnaryBodyLimit,
    (maxBytes) => (httpEffect) =>
      Effect.provideService(
        httpEffect,
        HttpServerRequest.MaxBodySize,
        ByteSize.bytes(maxBytes),
      ),
  ),
);

/**
 * `POST /rpc/protocol-builder`: the same procedures, one request per call,
 * over ndjson — the framing that lets `WatchProtocol` stream down a response
 * body. It is a cookie surface like `/rpc`, so it carries the same CSRF gate;
 * the maintenance gate is global and covers it already.
 */
const ProtocolBuilderHttp = (env: StudioEnv) => {
  const served = RpcServer.layerHttp({
    group: ProtocolBuilderGroup,
    path: PROTOCOL_BUILDER_RPC_PATH,
    protocol: 'http',
    ...SERVER_OPTIONS,
    streamBufferSize: 256,
  }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(boundedBody.layer),
  );
  return env.auth === undefined
    ? served
    : served.pipe(Layer.provide(requireSameOrigin(env.auth.baseUrl).layer));
};

/**
 * The lease keeper, presence, the live fan-out and the staged imports: one of
 * each per process, built once here and shared by both mounts.
 */
const ProtocolBuilderState = Layer.mergeAll(
  Leases.layer,
  Presence.layer,
  ProtocolEvents.layer,
  StagedImports.layer,
);

/** Both mounts, registered on the shell's router (`http/router.ts`). */
export const ProtocolBuilderRoutes = (env: StudioEnv) =>
  Layer.mergeAll(ProtocolBuilderWs(env), ProtocolBuilderHttp(env)).pipe(
    Layer.provide(HostSessionLive),
    Layer.provide(ProtocolBuilderHandlers),
    Layer.provide(ProtocolBuilderState),
  );
