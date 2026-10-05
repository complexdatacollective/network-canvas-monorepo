import { randomUUID } from 'node:crypto';

import { Deferred, Duration, Effect, Layer, Option, Predicate } from 'effect';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/http/HttpServerResponse';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import * as RpcServer from 'effect/rpc/RpcServer';
import * as Socket from 'effect/socket/Socket';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { WS_PATH } from '@codaco/studio-contract/rpc/studio';

import type { StudioEnv } from '../env.ts';
import { boundedBody } from '../http/body.ts';
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

export const PROTOCOL_BUILDER_RPC_PATH = '/rpc/protocol-builder';

/**
 * Fatal defects off: on, one dying handler ends every call on the connection.
 */
const SERVER_OPTIONS = {
  spanPrefix: 'protocolBuilder',
  disableFatalDefects: true,
} as const;

const MAINTENANCE_WATCH_INTERVAL = Duration.seconds(1);

const MAINTENANCE_CLOSE = new Socket.CloseEvent(1013, 'down for maintenance');

const SHUTDOWN_CLOSE = new Socket.CloseEvent(1001, 'server shutting down');

const closeWith = (socket: Socket.Socket, event: Socket.CloseEvent) =>
  Effect.flatMap(socket.writer, (writer) => writer.write(event)).pipe(
    Effect.scoped,
    Effect.ignore,
  );

/**
 * The operator's window alone: a `migrate` with nothing to apply takes the lock
 * for milliseconds on every deploy.
 */
const operatorWindow = (triggers: MaintenanceTriggers['Service']) =>
  Effect.map(
    triggers.closure,
    Option.filter((closure) => closure.trigger === 'maintenance'),
  );

const windowOpened = (triggers: MaintenanceTriggers['Service']) =>
  Effect.gen(function* () {
    while (Option.isNone(yield* operatorWindow(triggers))) {
      yield* Effect.sleep(MAINTENANCE_WATCH_INTERVAL);
    }
  });

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

const withUpgrade = (
  request: HttpServerRequest.HttpServerRequest,
  upgrade: HttpServerRequest.HttpServerRequest['upgrade'],
): HttpServerRequest.HttpServerRequest =>
  new Proxy(request, {
    get: (target, property) =>
      property === 'upgrade' ? upgrade : Reflect.get(target, property, target),
  });

/**
 * Built around the upgrade effect because `RpcServer.layerHttp`'s websocket
 * mount leaves no room for the drain or the maintenance watch.
 */
const WsRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const drain = yield* WebSocketDrain;
    const triggers = yield* MaintenanceTriggers;
    const upgradeToRpc = yield* RpcServer.toHttpEffectWebsocket(
      ProtocolBuilderGroup,
      SERVER_OPTIONS,
    );

    /**
     * The gate sees only the upgrade, so every batch of frames asks its reading
     * first.
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
                    closeWith(socket, MAINTENANCE_CLOSE),
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
        yield* drain.enter;
        const request = yield* HttpServerRequest.HttpServerRequest;
        const upgraded = yield* Deferred.make<Socket.Socket>();
        const upgrade = Effect.map(
          Effect.tap(request.upgrade, (socket) =>
            Deferred.succeed(upgraded, socket),
          ),
          gated,
        );

        const watchMaintenance = Effect.gen(function* () {
          yield* windowOpened(triggers);
          yield* closeWith(yield* Deferred.await(upgraded), MAINTENANCE_CLOSE);
          return yield* Effect.never;
        });

        // The close is written while the rpc server still reads the socket:
        // once it is interrupted the writer has no socket to write to.
        const closeOnDrain = Effect.gen(function* () {
          yield* drain.closing;
          yield* closeWith(yield* Deferred.await(upgraded), SHUTDOWN_CLOSE);
          return HttpServerResponse.empty();
        });

        // `raceFirst` rather than `race`, so a request that cannot be upgraded
        // fails at once.
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
          Effect.raceFirst(closeOnDrain),
        );
      }),
    );
  }),
);

const ProtocolBuilderWs = (env: StudioEnv) =>
  WsRoute.pipe(
    Layer.provide(
      RpcSerialization.layerSchemaBinary({
        maxFrameSize: MAX_SOCKET_FRAME_BYTES,
      }),
    ),
    Layer.provide(wsGuards(env)),
  );

/**
 * Made per mount: built once at module scope, a second server in the same
 * process was handed the first one's triggers.
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
 * Outermost first: the CSRF gate, then the principal, so an anonymous body is
 * refused before it is read, then the body bound.
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

const ProtocolBuilderState = Layer.mergeAll(
  Leases.layer,
  Presence.layer,
  ProtocolEvents.layer,
  StagedImports.layer,
);

export const ProtocolBuilderRoutes = (env: StudioEnv) =>
  Layer.mergeAll(ProtocolBuilderWs(env), ProtocolBuilderHttp(env)).pipe(
    Layer.provide(HostSessionLive),
    Layer.provide(ProtocolBuilderHandlers),
    Layer.provide(ProtocolBuilderState),
  );
