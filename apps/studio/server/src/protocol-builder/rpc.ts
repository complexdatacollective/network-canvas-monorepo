// The protocol-builder host's two mounts over one set of handlers and one
// per-process state: `/ws`, a socket per editor tab, and the unary plane
// `/rpc/protocol-builder` (#1927 §20 Q2), on its own path because `/rpc`
// belongs to `StudioRpcs` and the tags are flat.
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
import { HostSessionLive, WatchCutoff, WsConnection } from './session.ts';

/** Where the unary plane is served. */
export const PROTOCOL_BUILDER_RPC_PATH = '/rpc/protocol-builder';

/**
 * Fatal defects off: on, one dying handler (a rate-limit refusal, a database
 * fault) sends a `Defect` frame that ends every call on the connection,
 * including the socket's `WatchProtocol`.
 */
const SERVER_OPTIONS = {
  spanPrefix: 'protocolBuilder',
  disableFatalDefects: true,
} as const;

/** Polls the gate's own cached reading, so a watch costs no database read. */
const MAINTENANCE_WATCH_INTERVAL = Duration.seconds(1);

/** 1013, "Try Again Later": a temporary condition on the server's side. */
const MAINTENANCE_CLOSE = new Socket.CloseEvent(1013, 'down for maintenance');

/**
 * The operator's window alone. A held migration lock and a stale schema keep
 * refusing new requests, but a `migrate` with nothing to apply takes the lock
 * for milliseconds on every deploy, and ending every open editor over that
 * would fail in-flight edits for nothing; a schema change enters the window
 * first (#1901).
 */
const operatorWindow = (triggers: MaintenanceTriggers['Service']) =>
  Effect.map(
    triggers.closure,
    Option.filter((closure) => closure.trigger === 'maintenance'),
  );

/** Completes once the operator's window has opened. */
const windowOpened = (triggers: MaintenanceTriggers['Service']) =>
  Effect.gen(function* () {
    while (Option.isNone(yield* operatorWindow(triggers))) {
      yield* Effect.sleep(MAINTENANCE_WATCH_INTERVAL);
    }
  });

/**
 * The upgrade's guards, outermost first: the origin, the principal, the
 * per-user upgrade limit (keyed by the principal), and innermost, for an
 * admitted handshake only, the tab id moved off the query string. With no auth
 * configured there is no origin to compare and no session, so every upgrade
 * is refused.
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
 * The request with `upgrade` swapped for one that hands back the gated socket:
 * the websocket protocol upgrades the request it finds in its fiber, so this
 * is the one seam between the route and the frames.
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
 * The route for `/ws`, built around the protocol's upgrade effect because
 * `RpcServer.layerHttp`'s websocket mount leaves no room for the drain or the
 * maintenance watch, either of which ends the socket.
 */
const WsRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const drain = yield* WebSocketDrain;
    const triggers = yield* MaintenanceTriggers;
    const upgradeToRpc = yield* RpcServer.toHttpEffectWebsocket(
      ProtocolBuilderGroup,
      SERVER_OPTIONS,
    );

    const closeForMaintenance = (socket: Socket.Socket) =>
      Effect.flatMap(socket.writer, (writer) =>
        writer.write(MAINTENANCE_CLOSE),
      ).pipe(Effect.scoped, Effect.ignore);

    /**
     * The gate sees only the upgrade (#1901), so every batch of frames asks
     * its reading first; a batch arriving during the window is dropped and
     * closes the socket.
     */
    const gated = (socket: Socket.Socket): Socket.Socket =>
      Socket.make({
        writer: socket.writer,
        reader: Effect.map(socket.reader, (reader) => ({
          upgrade: reader.upgrade,
          pull: Effect.flatMap(reader.pull, (frames) =>
            Effect.flatMap(operatorWindow(triggers), (closure) =>
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
        // A shutdown waits for this socket to leave before it closes the
        // listener.
        yield* drain.enter;
        const request = yield* HttpServerRequest.HttpServerRequest;
        const upgraded = yield* Deferred.make<Socket.Socket>();
        const upgrade = Effect.map(
          Effect.tap(request.upgrade, (socket) =>
            Deferred.succeed(upgraded, socket),
          ),
          gated,
        );

        // An idle socket is closed too. The watch never finishes on its own:
        // the upgrade, which its close ends, wins the race.
        const watchMaintenance = Effect.gen(function* () {
          yield* windowOpened(triggers);
          yield* closeForMaintenance(yield* Deferred.await(upgraded));
          return yield* Effect.never;
        });

        // A socket defect is the upgrade's normal exit for anything but a
        // clean close. `raceFirst` rather than `race`, so a request that
        // cannot be upgraded at all fails at once.
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
 * `/ws` over `layerSchemaBinary`, so a staged asset crosses as bytes rather
 * than base64 in JSON (#1936). The listener's `maxPayload` refuses an oversized
 * frame with 1009 before the parser, which could not read another after it.
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
 * The rpc server reads the whole body before its own middleware runs, so the
 * bound is set on the route; the Node request destroys the connection once a
 * body crosses `MaxBodySize`.
 */
export const boundedBody = HttpRouter.middleware(
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
 * Ends a unary `WatchProtocol` when the operator's window opens, or when the
 * server stops: an open response holds `server.close()` for its whole graceful
 * window. Made per mount: built once at module scope, a second server in the
 * same process (the suites) was handed the first one's triggers.
 */
const unaryWatchCutoff = () =>
  HttpRouter.middleware(
    Effect.map(
      Effect.all([MaintenanceTriggers, WebSocketDrain]),
      ([triggers, drain]) =>
        (httpEffect) =>
          Effect.provideService(
            httpEffect,
            WatchCutoff,
            WatchCutoff.of({
              reached: Effect.raceFirst(windowOpened(triggers), drain.closing),
            }),
          ),
    ),
  );

/**
 * `POST /rpc/protocol-builder` over ndjson, which lets `WatchProtocol` stream
 * down a response body. Outermost first: the CSRF gate, then the principal —
 * so an anonymous body is refused before a byte of it is read — then the body
 * bound. `HostSession` still resolves the principal per call behind them.
 */
const ProtocolBuilderHttp = (env: StudioEnv) => {
  const principal =
    env.auth === undefined
      ? requirePrincipal
      : requirePrincipal.combine(requireSameOrigin(env.auth.baseUrl));
  return RpcServer.layerHttp({
    group: ProtocolBuilderGroup,
    path: PROTOCOL_BUILDER_RPC_PATH,
    protocol: 'http',
    ...SERVER_OPTIONS,
    streamBufferSize: 256,
  }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(
      boundedBody.combine(unaryWatchCutoff().combine(principal)).layer,
    ),
  );
};

/** One of each per process, shared by both mounts. */
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
