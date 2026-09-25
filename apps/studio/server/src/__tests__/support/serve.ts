import { createServer } from 'node:http';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';
import * as NetAddress from 'effect/unstable/net/NetAddress';

import type { Studio } from '../../app.ts';
import { Environment, type StudioEnv } from '../../env.ts';
import type { HealthChecks } from '../../http/health.ts';
import { Routes } from '../../http/router.ts';
import { WebSocketDrain } from '../../platform/ws-drain.ts';
import { studioServices } from './services.ts';

// The composed stack, for the suites that need more than the Hono residue:
// the health routes, the problem-JSON rewrite and the WebSocket upgrade all
// belong to the Effect shell now, so a suite reaching any of them composes
// the same layers the programs do rather than a second arrangement of them.

/**
 * The whole server on an ephemeral loopback port, for a suite that needs a
 * real socket.
 *
 * The build order is the programs': the listener, then the drain registry the
 * `/ws` route enters, then the routes, and the drain's shutdown hook last —
 * acquired after `serve` so that it releases first, before `server.close()`
 * starts waiting on the upgraded sockets this is meant to drain.
 */
export async function startStudioServer(
  env: StudioEnv,
  studio: Studio,
  checks: HealthChecks = studio.checks,
): Promise<{ origin: string; dispose: () => Promise<void> }> {
  const EnvironmentLive = Layer.succeed(Environment, env);
  const ServerLive = NodeHttpServer.layer(createServer, {
    port: 0,
    host: '127.0.0.1',
    gracefulShutdownTimeout: '10 seconds',
  });
  const ServeLive = HttpRouter.serve(Routes(studio, checks), {
    disableLogger: true,
    disableListenLog: true,
  });
  const layer = WebSocketDrain.layerShutdown.pipe(
    Layer.provideMerge(ServeLive),
    Layer.provideMerge(WebSocketDrain.layer),
    Layer.provideMerge(ServerLive),
    Layer.provide(EnvironmentLive),
    Layer.provide(studioServices(studio)),
  );

  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(Layer.buildWithScope(layer, scope));
  const address = Context.get(context, HttpServer.HttpServer).address;
  if (NetAddress.isUnixPathAddress(address)) {
    throw new Error('the test server did not bind a TCP port');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    dispose: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}

/**
 * The same stack in process, with no socket at all, for a suite that used to
 * drive `createApp(...).request(...)` and now needs what the Effect shell adds
 * around it.
 */
export function composeStudio(
  env: StudioEnv,
  studio: Studio,
  checks: HealthChecks = studio.checks,
): {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  dispose: () => Promise<void>;
} {
  const { handler, dispose } = HttpRouter.toWebHandler(
    Routes(studio, checks).pipe(
      Layer.provide(WebSocketDrain.layerTest),
      Layer.provide(Layer.succeed(Environment, env)),
      Layer.provide(studioServices(studio)),
    ),
    { disableLogger: true },
  );
  return {
    request: (path, init) =>
      handler(new Request(new URL(path, 'http://studio.test'), init)),
    dispose,
  };
}
