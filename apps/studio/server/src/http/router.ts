import { Effect, Layer } from 'effect';

import type { Studio } from '../app.ts';
import { Environment } from '../env.ts';
import { type HealthChecks, HealthRoutes } from './health.ts';
import { HonoBridge } from './hono-bridge.ts';
import { ClientAddressLive } from './middleware/client-address.ts';
import { ProblemJson } from './middleware/problem-json.ts';
import { RequestIdLive } from './middleware/request-id.ts';
import { RpcRoutes } from './rpc-routes.ts';
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
 * The Hono bridge is outermost — built last — because it is a catch-all:
 * everything the Effect shell owns has to be registered before the route that
 * matches everything else. `/rpc` sits between the health routes and `/ws`,
 * which is where design §8 puts it: the two machine surfaces the shell owns,
 * then the upgrade, then whatever is left.
 *
 * The environment is read here rather than passed in, because the only thing
 * the routes want from it is the browser-facing origin the `/rpc` CSRF gate
 * compares against, and every caller of this function already provides it.
 */
export const Routes = (studio: Studio, checks: HealthChecks) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const env = yield* Environment;
      const middlewares = ClientAddressLive.pipe(
        Layer.provideMerge(RequestIdLive.pipe(Layer.provideMerge(ProblemJson))),
      );
      const health = HealthRoutes(checks).pipe(Layer.provideMerge(middlewares));
      const rpc = RpcRoutes(studio.rpc, env).pipe(Layer.provideMerge(health));
      const ws = WsBridge(studio.ws).pipe(Layer.provideMerge(rpc));
      return HonoBridge(studio.app).pipe(Layer.provideMerge(ws));
    }),
  );
