import { Effect, Layer } from 'effect';

import type { Studio } from '../app.ts';
import { Environment } from '../env.ts';
import { ProtocolBuilderRoutes } from '../protocol-builder/rpc.ts';
import { ApiV1Routes } from './api-v1.ts';
import { AuthMount } from './auth-mount.ts';
import { type HealthChecks, HealthRoutes } from './health.ts';
import { ClientAddressLive } from './middleware/client-address.ts';
import { MaintenanceGate } from './middleware/maintenance.ts';
import { ProblemJson } from './middleware/problem-json.ts';
import { RequestIdLive } from './middleware/request-id.ts';
import { RpcRoutes } from './rpc-routes.ts';
import { StorageRoutes } from './storage.ts';

/**
 * Order is load-bearing: the problem-JSON rewrite must come before the request
 * id, and every middleware before any route, since a route captures the
 * middleware stack that exists when it is added. `Layer.mergeAll` gives no
 * order, so this is a `provideMerge` chain, which reads inside-out.
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
      const apiV1 = ApiV1Routes(studio.rpc).pipe(Layer.provideMerge(auth));
      const storage = StorageRoutes.pipe(Layer.provideMerge(apiV1));
      const rpc = RpcRoutes(studio.rpc, env).pipe(Layer.provideMerge(storage));
      return ProtocolBuilderRoutes(env).pipe(Layer.provideMerge(rpc));
    }),
  );
