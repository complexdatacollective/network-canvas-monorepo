import { Cause, Duration, Effect, type Layer, Record } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import type pg from 'pg';

import type { SchemaState } from '../db/schema.ts';

// The two health routes, shared by both processes (#1897, #1909). The web
// process mounts them on its own listener; the worker serves them on a
// loopback listener of its own, because a container healthcheck is the only
// reader a process that answers no request otherwise can have.
//
// It deliberately imports neither src/app.ts nor the RPC router: the worker
// reaches this module, and src/__tests__/process-separation.test.ts holds that
// graph to what a process which runs jobs may load.

/**
 * What a check reports when it did not fail. `degraded` is for a dependency
 * whose loss changes behaviour without making the process unfit to serve —
 * the Valkey limiter, which fails open.
 */
export type CheckVerdict = 'ok' | 'degraded';

/** Succeeding is the verdict; failing — with anything — is `failed`, with the message as reason. */
export type HealthCheck = Effect.Effect<CheckVerdict, unknown>;

/**
 * The checks this process runs, named. A check that does not apply — the
 * object store on a deployment that configures none — is left out rather than
 * reported: an unconfigured surface refuses by design, and reporting it as
 * failed would make a deployment that never wanted one permanently unready.
 */
export type HealthChecks = Readonly<Record<string, HealthCheck>>;

export type ReadinessStatus = 'ok' | 'degraded' | 'failing';

export type Readiness = {
  status: ReadinessStatus;
  checks: Record<string, string>;
};

/**
 * Each check gets a second. A readiness probe has a deadline of its own, and a
 * check that hangs on a wedged socket must report the reason rather than let
 * the probe time out with nothing to say — a timed-out probe names no failing
 * dependency, which is the whole point of answering at all.
 */
export const CHECK_TIMEOUT_MS = 1000;

/** One line, bounded: this ends up in a container runtime's status output. */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const single = message.replaceAll(/\s+/g, ' ').trim();
  return single.length > 200 ? `${single.slice(0, 197)}...` : single;
}

/**
 * The bound is `Effect.timeoutOrElse`, which *interrupts* the check it gave up
 * on. The promise race this replaces had to attach a no-op `catch` to the
 * losing attempt so that a late rejection was not unhandled; there is nothing
 * left pending to reject here, so no such guard is needed.
 */
const runCheck = Effect.fnUntraced(function* (check: HealthCheck) {
  return yield* check.pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(CHECK_TIMEOUT_MS),
      orElse: () =>
        Effect.fail(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)),
    }),
    Effect.catchCause((cause) =>
      Effect.succeed(`failed: ${reasonOf(Cause.squash(cause))}`),
    ),
  );
});

/**
 * Can this process reach the database, as the role it actually runs as? Each
 * process passes its own pool — the application pool in the web process, the
 * maintenance pool in the worker — so a grant or role problem that only one of
 * them has is reported by that one.
 *
 * The query is not cancelled when the bound above fires, and does not need to
 * be: the pool it runs on already caps what a hung probe can accumulate.
 * `connectionTimeoutMillis` (10 s, src/db/pool.ts) ends an attempt that never
 * connects, so probes cannot queue up faster than they expire, and `max` caps
 * the connections at stake whatever happens — a probe that outlives its
 * verdict holds one of them and then releases it. The object-store check has
 * neither bound, which is why that one is aborted for real.
 */
export function databaseCheck(pool: pg.Pool): HealthCheck {
  return Effect.map(
    Effect.tryPromise({
      try: () => pool.query('select 1'),
      catch: (cause: unknown) => cause,
    }),
    (): CheckVerdict => 'ok',
  );
}

/**
 * Is the database this build's? Both processes refuse a stale schema at boot
 * (src/platform/schema-gate.ts), but the development lane waits instead of
 * exiting, and a database can be recreated under a running process — so
 * readiness has to say so rather than infer it from the process still being
 * alive.
 *
 * The verdict is read through an Effect handed in rather than a pool taken
 * here, so the web process's fresh `checkSchema` and the program's
 * `SchemaStatus.read` are the same check from this module's point of view.
 */
export function schemaCheck(
  read: Effect.Effect<SchemaState, unknown>,
): HealthCheck {
  return Effect.flatMap(read, (state) =>
    state.kind === 'current'
      ? Effect.succeed<CheckVerdict>('ok')
      : Effect.fail(
          new Error(
            state.kind === 'absent'
              ? 'no Studio schema'
              : `not this build's schema (${state.reason})`,
          ),
        ),
  );
}

export const readiness: (checks: HealthChecks) => Effect.Effect<Readiness> =
  Effect.fnUntraced(function* (checks: HealthChecks) {
    // Concurrently: the budget is a second for the probe, not a second per
    // dependency, and a serial run would let one slow check hide the next one's
    // failure behind the runtime's own deadline.
    const results = yield* Effect.all(
      Record.map(checks, (check) => runCheck(check)),
      { concurrency: 'unbounded' },
    );
    const verdicts = Object.values(results);
    const status: ReadinessStatus = verdicts.some((verdict) =>
      verdict.startsWith('failed'),
    )
      ? 'failing'
      : verdicts.includes('degraded')
        ? 'degraded'
        : 'ok';
    return { status, checks: results };
  });

/**
 * `/healthz` is liveness and says nothing about dependencies: a process that
 * answers it is running, which is what a container runtime restarts on.
 * `/readyz` is what a deployment reads before it sends traffic, and what names
 * the failing dependency when it will not. 503 only for `failing` — a degraded
 * process still serves.
 */
export function HealthRoutes(
  checks: HealthChecks,
): Layer.Layer<never, never, HttpRouter.HttpRouter> {
  return HttpRouter.use((router) =>
    Effect.gen(function* () {
      yield* router.add(
        'GET',
        '/healthz',
        HttpServerResponse.jsonUnsafe({ status: 'ok' }),
      );
      yield* router.add(
        'GET',
        '/readyz',
        Effect.map(readiness(checks), (result) =>
          HttpServerResponse.jsonUnsafe(result, {
            status: result.status === 'failing' ? 503 : 200,
          }),
        ),
      );
    }),
  );
}
