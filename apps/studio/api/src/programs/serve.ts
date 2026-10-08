import { Deferred, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';

import { createStudio, type Studio } from '../app.ts';
import { DeniedAttempts } from '../audit/denial-rate-limit.ts';
import { AuditSignal } from '../audit/signal.ts';
import { AuthService } from '../auth/service.ts';
import { Database, DatabaseAbsent, ReadinessDatabase } from '../db/client.ts';
import { UntenantedScope } from '../db/tenant.ts';
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
import { Analytics } from '../platform/analytics.ts';
import { BootChecks, type BootRefusal } from '../platform/boot-checks.ts';
import {
  HttpServerLive,
  ServerTelemetryLive,
} from '../platform/http-server.ts';
import { InstallationIdentity } from '../platform/installation-identity.ts';
import { LoggerLive, LogLevelLive } from '../platform/logger.ts';
import { MaintenanceState } from '../platform/maintenance-state.ts';
import { RuntimeMetricsLive } from '../platform/runtime-metrics.ts';
import { SchemaStatus } from '../platform/schema-gate.ts';
import { TracingLive } from '../platform/tracing.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';
import { Doorbell, doorbellCheck } from '../protocol-builder/doorbell.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { RateLimitStore } from '../rate-limit/store.ts';
import type { StudioServices } from '../rpc/deps.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { readInstallationId } from '../setup/bootstrap.ts';
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
      yield* Effect.log('Network Canvas Studio listening on its address').pipe(
        Effect.annotateLogs({
          version: STUDIO_VERSION,
          address: HttpServer.formatAddress(server.address),
        }),
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
      }).pipe(Layer.provide(ServerTelemetryLive)),
    ),
    Layer.provideMerge(WebSocketDrain.layer),
    Layer.provideMerge(HttpServerLive),
  );
}

function withDatabase(
  env: StudioEnv,
  db: DbEnv,
  refusal: Deferred.Deferred<never, BootRefusal>,
) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const readiness = yield* ReadinessDatabase;
      const status = yield* SchemaStatus;
      const limiter = yield* RateLimiter;
      const auth = yield* AuthService;
      const objectStore = yield* ObjectStore;
      const triggers = yield* MaintenanceTriggers;
      const doorbell = yield* Doorbell;

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
        doorbell: doorbellCheck(env, doorbell),
      });
    }),
  ).pipe(
    Layer.provide(Doorbell.layer),
    Layer.provide(
      InstallationIdentity.resolvedBy(
        UntenantedScope.open(readInstallationId()),
      ),
    ),
    // Listening does not wait for the schema or the keyring: an upgrade starts
    // this process before `migrate` runs, and it answers closed meanwhile.
    // `BootChecks` runs both in the background and holds the gate closed
    // until they pass (#1901).
    Layer.provide(MaintenanceTriggers.layer),
    Layer.provide(BootChecks.layer(refusal)),
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
    Layer.provide(Analytics.layerFromEnvironment),
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
      return Serve(studio, {
        ...studio.checks,
        doorbell: doorbellCheck(env, yield* Doorbell),
      });
    }),
  ).pipe(
    Layer.provide(Doorbell.layer),
    Layer.provide(MaintenanceTriggers.layerOpen),
    Layer.provide(ObjectStoreLive),
    Layer.provide(AuthService.layerFromEnvironment),
    Layer.provide(DeniedAttempts.layer),
    Layer.provide(RateLimiter.layer),
    Layer.provide(RateLimitStore.layer),
    Layer.provide(SecretsCipher.layerAbsent),
    Layer.provide(Jobs.layer({ schema: JOB_SCHEMA })),
    Layer.provide(AuditSignal.layer),
    Layer.provide(Analytics.layerDisabled),
    Layer.provide(DatabaseAbsent),
  );
}

const ServeProgramLayer = (refusal: Deferred.Deferred<never, BootRefusal>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const env = yield* Environment;
      return env.db ? withDatabase(env, env.db, refusal) : withoutDatabase(env);
    }),
  ).pipe(
    Layer.provide(RuntimeMetricsLive),
    Layer.provide(
      Layer.mergeAll(LoggerLive, LogLevelLive, TracingLive('serve')),
    ),
    Layer.provide(Environment.layer),
  );

/**
 * Serves until interrupted, or until a boot check refuses: the server is
 * already listening by then, so the refusal is raced against it, and losing
 * the race shuts it down before the refusal is reported.
 */
export const ServeProgram = Effect.gen(function* () {
  const refusal = yield* Deferred.make<never, BootRefusal>();
  return yield* Effect.raceFirst(
    Layer.launch(ServeProgramLayer(refusal)),
    Deferred.await(refusal),
  );
}).pipe(reportingRefusals);
