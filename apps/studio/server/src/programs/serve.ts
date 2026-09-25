import { Cause, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';

import { createStudio, type Studio } from '../app.ts';
import { DeniedAttempts } from '../audit/denial-rate-limit.ts';
import { AuditSignal } from '../audit/signal.ts';
import { AuthService } from '../auth/service.ts';
import { Database, DatabaseAbsent } from '../db/client.ts';
import { DatabasePool } from '../db/database-pool.ts';
import { type DbEnv, Environment, type StudioEnv } from '../env.ts';
import { type HealthChecks, schemaCheck } from '../http/health.ts';
import {
  maintenanceCheck,
  MaintenanceTriggers,
} from '../http/middleware/maintenance.ts';
import { Routes } from '../http/router.ts';
import { JobClock } from '../jobs/clock.ts';
import { Jobs } from '../jobs/jobs.ts';
import { JOB_SCHEMA } from '../jobs/queues.ts';
import { HttpServerLive } from '../platform/http-server.ts';
import { LoggerLive } from '../platform/logger.ts';
import { MaintenanceState } from '../platform/maintenance-state.ts';
import { SchemaStatus } from '../platform/schema-gate.ts';
import { TracingLive } from '../platform/tracing.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { RateLimitStore } from '../rate-limit/store.ts';
import type { StudioServices } from '../rpc/deps.ts';
import {
  KeyringLive,
  SecretsCipherAbsent,
  SecretsCipherLive,
  verifyKeyring,
} from '../secrets/services.ts';
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
// sessions drain, then the listener closes, then the rate-limit store and the
// pool release, then the tracer flushes. Exit codes come from
// `NodeRuntime.runMain`'s teardown — 0 after a clean stop, 130 on a signal, 1
// for a layer that would not build.

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
      const limiter = yield* RateLimiter;
      const auth = yield* AuthService;
      const triggers = yield* MaintenanceTriggers;

      // The Effect services every data-layer caller on this process runs on,
      // captured as one context and handed down to the promise-shaped
      // consumers that cannot take layers: the protocol builder's oRPC router
      // and the Hono residue (`rpc/deps.ts`). better-auth's sign-in mail
      // callback is not one of them any more: `AuthService.layer` builds it
      // over the services its own layer was given.
      //
      // Nothing here cares when the schema becomes current: a statement against
      // a database that has not been migrated yet fails the one request that
      // made it, and the next one tries again. That matters on the development
      // lane, where `pnpm dev` can finish applying the schema well after this
      // process booted.
      const services = yield* Effect.context<StudioServices>();

      // What runs once the schema is current. Beside the fingerprint check and
      // for the same reason (#1900): a keyring that cannot produce a key id
      // already in the database would serve every surface that touches no
      // secret and fail the rest one request at a time.
      const bootChecks = Effect.gen(function* () {
        yield* status.current;
        yield* verifyKeyring;
      });
      // In a deployment the schema is current at boot — the gate would have
      // refused the build otherwise — so the checks settle before the listener
      // binds and a refusal never reaches a request. In the development lane
      // `current` completes later, from the gate's retry, and the listener must
      // not wait for it: `pnpm dev` finishes its reset while this process is
      // already running.
      if (env.devDefaults) {
        // A forked refusal has nothing above it to fail, and a development
        // process that went on serving with a keyring that cannot read its own
        // database would be the one lane where the check does not stop
        // anything. So it is reported and the process ends, exactly as the
        // print-and-exit this check used to be did from inside the promise.
        yield* Effect.forkScoped(
          Effect.tapCause(bootChecks, (cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError(cause).pipe(
                  Effect.andThen(Effect.sync(() => process.exit(1))),
                ),
          ),
        );
      } else {
        yield* bootChecks;
      }

      const studio = createStudio(env, { services, pool, limiter, auth });
      return Serve(studio, {
        ...studio.checks,
        // Is the database this build's? Both processes refuse a stale schema
        // at boot, but the development lane waits instead of exiting, and a
        // database can be recreated under a running process — so readiness
        // has to say so rather than infer it from the process still being
        // alive.
        schema: schemaCheck(status.read),
        // Whether the maintenance gate is refusing requests, and why (#1901):
        // the same cached triggers the gate reads, so the two cannot disagree.
        maintenance: maintenanceCheck(triggers),
      });
    }),
  ).pipe(
    // Built once and provided to both the gate and the readiness check, so
    // they share one cached reading of each trigger.
    Layer.provide(MaintenanceTriggers.layer),
    Layer.provide(MaintenanceState.layer),
    Layer.provide(SchemaStatus.layer),
    // better-auth over the application client (#1927 §12). Serve-only: the
    // worker builds no auth provider at all. Above everything it asks for —
    // the client, the cipher, the limiter it counts sign-in attempts in and
    // the queue sign-in mail goes on.
    Layer.provide(AuthService.layerFromEnvironment),
    // The one Valkey client and the two services over it: every limit this
    // process enforces, and the audit denial window. Acquired after the pool
    // and before anything that charges a limit, so it releases after the
    // listener closes and before the pool ends.
    Layer.provide(DeniedAttempts.layer),
    Layer.provide(RateLimiter.layer),
    Layer.provide(RateLimitStore.layer),
    Layer.provide(DatabasePool.layerApplication(db)),
    // The application client and everything over it. `Jobs` is built above
    // `JobClock.layerApplication` so the skew against the database is measured
    // once, at boot, rather than per enqueue — the correction the
    // node-postgres enqueue this replaced got for free by writing `now()` into
    // the statement.
    Layer.provide(SecretsCipherLive),
    Layer.provide(KeyringLive),
    Layer.provide(Jobs.layer({ schema: JOB_SCHEMA })),
    Layer.provide(JobClock.layerApplication()),
    Layer.provide(AuditSignal.layer),
    Layer.provideMerge(Layer.orDie(Database.layerFromEnvironment)),
  );
}

/**
 * The shape of the process without a database: status, the client-facing
 * refusals, and readiness that names nothing it was never asked to check.
 */
function withoutDatabase(env: StudioEnv) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const studio = createStudio(env, {
        limiter: yield* RateLimiter,
        auth: yield* AuthService,
      });
      return Serve(studio, studio.checks);
    }),
  ).pipe(
    // Disabled: with no database the selector never builds better-auth, so
    // none of the stand-ins below it is asked for anything.
    // No `deployment_state` to read, no lock and no schema: never closed.
    Layer.provide(MaintenanceTriggers.layerOpen),
    Layer.provide(AuthService.layerFromEnvironment),
    Layer.provide(DeniedAttempts.layer),
    Layer.provide(RateLimiter.layer),
    Layer.provide(RateLimitStore.layer),
    // The `/rpc` route asks for the data layer whatever this process is, so
    // the requirement has to be met here too. Nothing reaches it: the auth
    // gate is off without a database, so every procedure that would open a
    // transaction refuses before a client is asked for, and the two that stay
    // reachable answer from the absent pool. The stand-ins throw rather than
    // degrade, which is what makes "nothing reaches it" checkable.
    Layer.provide(SecretsCipherAbsent),
    Layer.provide(Jobs.layer({ schema: JOB_SCHEMA })),
    Layer.provide(AuditSignal.layer),
    Layer.provide(DatabaseAbsent),
  );
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
