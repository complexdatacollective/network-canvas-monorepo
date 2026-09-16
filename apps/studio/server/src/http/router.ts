import { Layer } from 'effect';

import type { Studio } from '../app.ts';
import { type HealthChecks, HealthRoutes } from './health.ts';
import { HonoBridge } from './hono-bridge.ts';
import { ClientAddressLive } from './middleware/client-address.ts';
import { ProblemJson } from './middleware/problem-json.ts';
import { RequestIdLive } from './middleware/request-id.ts';
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
 * matches everything else.
 */
export const Routes = (studio: Studio, checks: HealthChecks) => {
  const middlewares = ClientAddressLive.pipe(
    Layer.provideMerge(RequestIdLive.pipe(Layer.provideMerge(ProblemJson))),
  );
  const health = HealthRoutes(checks).pipe(Layer.provideMerge(middlewares));
  const ws = WsBridge(studio.ws).pipe(Layer.provideMerge(health));
  return HonoBridge(studio.app).pipe(Layer.provideMerge(ws));
};
