import { Cause, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';

import { createStudio, type Studio } from '../app.ts';
import { DeniedAttempts } from '../audit/denial-rate-limit.ts';
import { AuditSignal } from '../audit/signal.ts';
import { AuthService } from '../auth/service.ts';
import { Database, DatabaseAbsent, ReadinessDatabase } from '../db/client.ts';
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
import { SecretsCipher } from '../secrets/services.ts';
import { KeyringVerified, verifyKeyring } from '../secrets/verify.ts';
import { ObjectStoreLive } from '../storage/live.ts';
import { ObjectStore } from '../storage/object-store.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

/**
 * `WebSocketDrain.layerShutdown` is acquired last so it releases first, before
 * `server.close()`, which waits for upgraded sockets.
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
        // The default logger would print a second request log line.
        disableLogger: true,
        disableListenLog: true,
      }),
    ),
    Layer.provideMerge(WebSocketDrain.layer),
    Layer.provideMerge(HttpServerLive),
  );
}

function BootChecks(env: StudioEnv) {
  if (!env.devDefaults) {
    return KeyringVerified.pipe(
      Layer.provide(
        Layer.effectDiscard(SchemaStatus.use((status) => status.current)),
      ),
    );
  }
  return Layer.effectDiscard(
    Effect.forkScoped(
      Effect.tapCause(
        SchemaStatus.use((status) =>
          Effect.andThen(status.current, verifyKeyring),
        ),
        (cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.logError(cause).pipe(
                Effect.andThen(Effect.sync(() => process.exit(1))),
              ),
      ),
    ),
  );
}

function withDatabase(env: StudioEnv, db: DbEnv) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const readiness = yield* ReadinessDatabase;
      const status = yield* SchemaStatus;
      const limiter = yield* RateLimiter;
      const auth = yield* AuthService;
      const objectStore = yield* ObjectStore;
      const triggers = yield* MaintenanceTriggers;

      const services = yield* Effect.context<StudioServices>();

      const studio = createStudio(env, {
        services,
        readiness: readiness.sql,
        limiter,
        auth,
        objectStore,
      });
      return Serve(studio, {
        ...studio.checks,
        schema: schemaCheck(status.read),
        maintenance: maintenanceCheck(triggers),
      });
    }),
  ).pipe(
    Layer.provide(BootChecks(env)),
    Layer.provide(MaintenanceTriggers.layer),
    Layer.provide(MaintenanceState.layer),
    Layer.provide(SchemaStatus.layer),
    Layer.provide(ObjectStoreLive),
    Layer.provide(AuthService.layerFromEnvironment),
    // Acquired before anything that charges a limit, so it releases after the
    // listener closes.
    Layer.provide(DeniedAttempts.layer),
    Layer.provide(RateLimiter.layer),
    Layer.provide(RateLimitStore.layer),
    Layer.provide(Layer.orDie(ReadinessDatabase.layer('app', db))),
    // `Jobs` is built above `JobClock.layerApplication` so the skew against the
    // database is measured once, at boot.
    Layer.provide(SecretsCipher.layerFromEnvironment),
    Layer.provide(Jobs.layer({ schema: JOB_SCHEMA })),
    Layer.provide(JobClock.layerApplication()),
    Layer.provide(AuditSignal.layer),
    Layer.provideMerge(Layer.orDie(Database.layerFromEnvironment)),
  );
}

function withoutDatabase(env: StudioEnv) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const studio = createStudio(env, {
        limiter: yield* RateLimiter,
        auth: yield* AuthService,
        objectStore: yield* ObjectStore,
      });
      return Serve(studio, studio.checks);
    }),
  ).pipe(
    Layer.provide(MaintenanceTriggers.layerOpen),
    Layer.provide(ObjectStoreLive),
    Layer.provide(AuthService.layerFromEnvironment),
    Layer.provide(DeniedAttempts.layer),
    Layer.provide(RateLimiter.layer),
    Layer.provide(RateLimitStore.layer),
    Layer.provide(SecretsCipher.layerAbsent),
    Layer.provide(Jobs.layer({ schema: JOB_SCHEMA })),
    Layer.provide(AuditSignal.layer),
    Layer.provide(DatabaseAbsent),
  );
}

const ServeProgramLayer = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Environment;
    return env.db ? withDatabase(env, env.db) : withoutDatabase(env);
  }),
).pipe(
  Layer.provide(Layer.mergeAll(LoggerLive, TracingLive('serve'))),
  Layer.provide(Environment.layer),
);

export const ServeProgram =
  Layer.launch(ServeProgramLayer).pipe(reportingRefusals);
