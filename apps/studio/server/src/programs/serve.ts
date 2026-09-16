import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';

import { createStudio, type Studio } from '../app.ts';
import { DatabasePool } from '../db/database-pool.ts';
import { type DbEnv, Environment, type StudioEnv } from '../env.ts';
import { type HealthChecks, schemaCheck } from '../http/health.ts';
import { Routes } from '../http/router.ts';
import { createJobClient } from '../jobs/client.ts';
import { HttpServerLive } from '../platform/http-server.ts';
import { LoggerLive } from '../platform/logger.ts';
import { SchemaStatus } from '../platform/schema-gate.ts';
import { TracingLive } from '../platform/tracing.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { RateLimitStoresLive } from '../rate-limit/store.ts';
import { verifySecretKeysOrExit } from '../secrets/boot.ts';
import { STUDIO_VERSION } from '../version.ts';

// The web program, development and production both: one Node process serving
// the public API, the internal RPC surface, /healthz and /readyz, and the app
// WebSocket endpoint. It serves no client assets at all (#1909): nginx does,
// from the studio-web image, and development serves them from the Vite dev
// server — which proxies these paths here, so every topology presents a single
// origin to the browser.
//
// It runs no background work at all (#1895): jobs are created here, inside the
// transaction that caused them, and executed by the worker process
// (src/programs/worker.ts) started from the same image. Nothing here sends
// mail, and the mail variables are not even read — see `Environment.layer`.
//
// The whole process is one Layer. Acquisition order is the boot order and
// finalizers run in reverse, so the shutdown a container stop asks for is a
// property of the graph rather than of a hand-written handler: websocket
// sessions drain, then the listener closes, then the job client stops, then
// the rate-limit stores and the pool release, then the tracer flushes. Exit
// codes come from `NodeRuntime.runMain`'s teardown — 0 after a clean stop,
// 130 on a signal, 1 for a layer that would not build.

/**
 * The listener and everything registered on it. `WebSocketDrain.layerShutdown`
 * is acquired last so it releases first: it tells every open `/ws` session to
 * finish and waits for them (bounded) before the server detaches its handlers
 * and closes — `server.close()` waits for upgraded sockets, so a drain that
 * ran after it would stall the stop for the whole graceful window (#1247).
 */
function Serve(studio: Studio, checks: HealthChecks) {
  const Listening = Layer.effectDiscard(
    Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      yield* Effect.log(
        `Network Canvas Studio ${STUDIO_VERSION} listening on ${HttpServer.formatAddress(server.address)}`,
      );
    }),
  );
  return WebSocketDrain.layerShutdown.pipe(
    Layer.provideMerge(Listening),
    Layer.provideMerge(
      HttpRouter.serve(Routes(studio, checks), {
        // #1897 owns the request log line and its annotations; the default
        // logger would print a second one per request. The boot line above
        // replaces the default listen log.
        disableLogger: true,
        disableListenLog: true,
      }),
    ),
    Layer.provideMerge(WebSocketDrain.layer),
    Layer.provideMerge(HttpServerLive),
  );
}

/**
 * The shape of the process with a database: the application-role pool, the
 * enqueue-only job client, the schema gate, and the boot checks that run once
 * the schema is current.
 */
function withDatabase(env: StudioEnv, db: DbEnv) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const { pool } = yield* DatabasePool;
      const status = yield* SchemaStatus;

      // The enqueue-only pg-boss, on a small pool of its own pinned to the
      // application role: every job is created by the role that may create one
      // and can do nothing else with it. It exists from the moment there is a
      // database to reach, and connects when the schema is current — pg-boss
      // verifies its own installed version at start and never migrates (#1895).
      //
      // The development lane is why the two are separate. There the wait can
      // outlast this boot, and a client that was only built once the schema
      // arrived would leave every surface that enqueues without a queue for the
      // life of the process. This one starts from `current` instead, and a
      // start that failed is retried by the next enqueue rather than needing a
      // restart. Nothing of ours is ever in flight on it, so stopping it on
      // release only ends the pool it owns.
      const jobs = yield* Effect.acquireRelease(
        Effect.sync(() => createJobClient(db)),
        (client) => Effect.promise(() => client.stop()),
      );

      // What runs once the schema is current. Beside the fingerprint check and
      // for the same reason (#1900): a keyring that cannot produce a key id
      // already in the database would serve every surface that touches no
      // secret and fail the rest one request at a time. It runs before the job
      // client starts, because a queue is the first thing that would act on
      // one. A queue that cannot be reached is not fatal: the requests that need
      // it fail with the reason and the next one tries again, and refusing the
      // boot would take down every surface that has nothing to do with
      // background work.
      const bootChecks = Effect.gen(function* () {
        yield* status.current;
        yield* Effect.promise(() => verifySecretKeysOrExit(env));
        yield* Effect.promise(() => jobs.start()).pipe(
          Effect.catchCause((cause) =>
            Effect.logError('Could not start the job client:', cause),
          ),
        );
      });
      // In a deployment the schema is current at boot — the gate would have
      // refused the build otherwise — so the checks settle before the listener
      // binds and a refusal never reaches a request. In the development lane
      // `current` completes later, from the gate's retry, and the listener must
      // not wait for it: `pnpm dev` finishes its reset while this process is
      // already running.
      if (env.devDefaults) {
        yield* Effect.forkScoped(bootChecks);
      } else {
        yield* bootChecks;
      }

      const studio = createStudio(env, { jobs, pool });
      return Serve(studio, {
        ...studio.checks,
        // Is the database this build's? Both processes refuse a stale schema
        // at boot, but the development lane waits instead of exiting, and a
        // database can be recreated under a running process — so readiness
        // has to say so rather than infer it from the process still being
        // alive.
        schema: schemaCheck(status.read),
      });
    }),
  ).pipe(
    Layer.provide(SchemaStatus.layer),
    Layer.provide(RateLimitStoresLive),
    Layer.provide(DatabasePool.layerApplication(db)),
  );
}

/**
 * The shape of the process without a database: status, the client-facing
 * refusals, and readiness that names nothing it was never asked to check.
 */
function withoutDatabase(env: StudioEnv) {
  const studio = createStudio(env);
  return Serve(studio, studio.checks).pipe(Layer.provide(RateLimitStoresLive));
}

/**
 * Everything the web process is. `Layer.launch` keeps it alive until
 * interrupted; `Environment` is decoded once, at the root, and every layer
 * below reads the same value.
 */
export const ServeProgram = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Environment;
    return env.db ? withDatabase(env, env.db) : withoutDatabase(env);
  }),
).pipe(
  Layer.provide(Layer.mergeAll(LoggerLive, TracingLive('serve'))),
  Layer.provide(Environment.layer),
);
