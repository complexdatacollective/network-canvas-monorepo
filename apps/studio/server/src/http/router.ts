import { Effect, Layer } from 'effect';

import type { Studio } from '../app.ts';
import { Environment } from '../env.ts';
import { ApiV1Routes } from './api-v1.ts';
import { AuthMount } from './auth-mount.ts';
import { type HealthChecks, HealthRoutes } from './health.ts';
import { HonoBridge } from './hono-bridge.ts';
import { ClientAddressLive } from './middleware/client-address.ts';
import { MaintenanceGate } from './middleware/maintenance.ts';
import { ProblemJson } from './middleware/problem-json.ts';
import { RequestIdLive } from './middleware/request-id.ts';
import { RpcRoutes } from './rpc-routes.ts';
import { StorageRoutes } from './storage.ts';
import { WsBridge } from './ws-bridge.ts';

/**
 * Everything this process serves, registered in the order it has to be.
 *
 * Order is load-bearing twice over. A global middleware registered first runs
 * outermost and registers its pre-response handler first, so the problem-JSON
 * rewrite has to come before the request id — otherwise the rewrite would
 * replace the response the id header was put on. And every middleware has to
 * be registered before any route, because a route captures the middleware
 * stack that exists when it is added. `Layer.mergeAll` builds its members
 * concurrently and would give no order at all, so this is a `provideMerge`
 * chain instead: `self.pipe(Layer.provideMerge(that))` builds `that` first,
 * which is why the chain below reads inside-out.
 *
 * The maintenance gate is the last global middleware (#1901): inside the
 * problem-JSON rewrite and the request id, so its 503 carries an
 * `x-request-id` like any other answer, and wrapping every route, so nothing
 * behind it runs while the instance is closed. A global middleware sees every
 * request before a route is matched, which is why the gate exempts `/healthz`
 * and `/readyz` by exact path itself rather than by being registered after
 * them.
 *
 * The routes follow in design §8's order: health, the better-auth mount, the
 * public API's limit, `/storage`, `/rpc`, the `/ws` upgrade, and last the Hono
 * bridge — outermost, built last — because it is a catch-all: everything the
 * Effect shell owns has to be registered before the route that matches
 * everything else. Each route layer carries its own route middlewares (the
 * origin gates, the principal, the HTTP-level limits), so the order among the
 * routes is registration order and nothing more.
 *
 * The environment is read here rather than passed in, because the only thing
 * the routes want from it is the browser-facing origin the `/rpc` CSRF gate
 * compares against, and every caller of this function already provides it.
 */
export const Routes = (studio: Studio, checks: HealthChecks) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const env = yield* Environment;
      const middlewares = MaintenanceGate.pipe(
        Layer.provideMerge(
          ClientAddressLive.pipe(
            Layer.provideMerge(
              RequestIdLive.pipe(Layer.provideMerge(ProblemJson)),
            ),
          ),
        ),
      );
      const health = HealthRoutes(checks).pipe(Layer.provideMerge(middlewares));
      const auth = AuthMount.pipe(Layer.provideMerge(health));
      const apiV1 = ApiV1Routes(studio.app).pipe(Layer.provideMerge(auth));
      const storage = StorageRoutes.pipe(Layer.provideMerge(apiV1));
      const rpc = RpcRoutes(studio.rpc, env).pipe(Layer.provideMerge(storage));
      const ws = WsBridge(studio.ws).pipe(Layer.provideMerge(rpc));
      return HonoBridge(studio.app).pipe(Layer.provideMerge(ws));
    }),
  );
