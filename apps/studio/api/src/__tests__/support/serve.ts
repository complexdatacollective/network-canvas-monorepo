import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Clock, Context, Effect, Exit, Layer, Scope } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import * as NetAddress from 'effect/net/NetAddress';

import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';

import type { Studio } from '../../app.ts';
import { Environment, type StudioEnv } from '../../env.ts';
import type { HealthChecks } from '../../http/health.ts';
import { MaintenanceTriggers } from '../../http/middleware/maintenance.ts';
import { Routes } from '../../http/router.ts';
import { WebSocketDrain } from '../../platform/ws-drain.ts';
import { UnaryBodyLimit } from '../../protocol-builder/rpc.ts';
import { studioServices } from './services.ts';

/**
 * The drain's shutdown hook is acquired after `serve` so that it releases
 * first, before `server.close()` starts waiting on the upgraded sockets.
 */
export async function startStudioServer(
  env: StudioEnv,
  studio: Studio,
  checks: HealthChecks = studio.checks,
  maintenance: Layer.Layer<MaintenanceTriggers> = MaintenanceTriggers.layerOpen,
  options: {
    readonly wsMaxPayload?: number;
    readonly unaryBodyLimit?: number;
    readonly clock?: Clock.Clock;
  } = {},
): Promise<{ origin: string; dispose: () => Promise<void> }> {
  const EnvironmentLive = Layer.succeed(Environment, env);
  const ServerLive = NodeHttpServer.layer(createServer, {
    port: 0,
    host: '127.0.0.1',
    gracefulShutdownTimeout: '10 seconds',
    websocket: { maxPayload: options.wsMaxPayload ?? MAX_SOCKET_FRAME_BYTES },
  });
  const ServeLive = HttpRouter.serve(Routes(studio, checks), {
    disableLogger: true,
    disableListenLog: true,
  });
  const layer = WebSocketDrain.layerShutdown.pipe(
    Layer.provideMerge(ServeLive),
    Layer.provideMerge(WebSocketDrain.layer),
    Layer.provideMerge(ServerLive),
    Layer.provide(maintenance),
    Layer.provide(EnvironmentLive),
    Layer.provide(studioServices(studio)),
  );
  const bounded =
    options.unaryBodyLimit === undefined
      ? layer
      : layer.pipe(
          Layer.provide(Layer.succeed(UnaryBodyLimit)(options.unaryBodyLimit)),
        );
  const clocked =
    options.clock === undefined
      ? bounded
      : bounded.pipe(Layer.provide(Layer.succeed(Clock.Clock)(options.clock)));

  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(Layer.buildWithScope(clocked, scope));
  const address = Context.get(context, HttpServer.HttpServer).address;
  if (NetAddress.isUnixPathAddress(address)) {
    throw new Error('the test server did not bind a TCP port');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    dispose: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}

export function composeStudio(
  env: StudioEnv,
  studio: Studio,
  checks: HealthChecks = studio.checks,
  maintenance: Layer.Layer<MaintenanceTriggers> = MaintenanceTriggers.layerOpen,
): {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  dispose: () => Promise<void>;
} {
  const { handler, dispose } = HttpRouter.toWebHandler(
    Routes(studio, checks).pipe(
      Layer.provide(WebSocketDrain.layerTest),
      Layer.provide(maintenance),
      Layer.provide(Layer.succeed(Environment, env)),
      Layer.provide(studioServices(studio)),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  );
  return {
    request: (path, init) =>
      handler(new Request(new URL(path, 'http://studio.test'), init)),
    dispose,
  };
}
