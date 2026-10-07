import { Cause, Duration, Effect, type Layer, Option, Record } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';
import type { SqlClient } from 'effect/sql';

import { deepestMessage, isMissingRole } from '../db/errors.ts';
import { databaseAlive } from '../db/readiness.ts';
import { checkSchemaEffect, type SchemaState } from '../db/schema.ts';
import { WebSocketDrain } from '../platform/ws-drain.ts';

export type CheckVerdict = 'ok' | 'degraded';

export type HealthCheck = Effect.Effect<CheckVerdict, unknown>;

export type HealthChecks = Readonly<Record<string, HealthCheck>>;

export type ReadinessStatus = 'ok' | 'degraded' | 'failing';

export type Readiness = {
  status: ReadinessStatus;
  checks: Record<string, string>;
};

const CHECK_TIMEOUT_MS = 1000;

/**
 * What `/readyz` says when the database has never been provisioned: the
 * connection is refused because the Studio roles do not exist yet. The raw
 * driver text names a role, and `/readyz` is reachable by anyone who can reach
 * the instance, so the reason is the state, not the error (#1901).
 */
const NOT_SET_UP = 'the database has not been set up for Studio yet';

function reasonOf(error: unknown): string {
  if (isMissingRole(error)) return NOT_SET_UP;
  const message = deepestMessage(error) ?? String(error);
  const single = message.replaceAll(/\s+/g, ' ').trim();
  return single.length > 200 ? `${single.slice(0, 197)}...` : single;
}

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

export function databaseCheck(sql: SqlClient.SqlClient): HealthCheck {
  return Effect.as(databaseAlive(sql), 'ok' satisfies CheckVerdict);
}

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

export function schemaCheckOn(sql: SqlClient.SqlClient): HealthCheck {
  return schemaCheck(checkSchemaEffect(sql));
}

export const readiness: (checks: HealthChecks) => Effect.Effect<Readiness> =
  Effect.fnUntraced(function* (checks: HealthChecks) {
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
 * A draining replica answers `/readyz` with 503 so a load balancer stops
 * routing to it. This is best-effort: the window lasts only as long as the
 * drain, which ends at once with no sockets open and after `DRAIN_TIMEOUT` at
 * most, and the compose stack health-checks `/healthz`, so it is advisory for
 * other load balancers. The worker serves these routes without a
 * `WebSocketDrain`.
 */
export function HealthRoutes(
  checks: HealthChecks,
): Layer.Layer<never, never, HttpRouter.HttpRouter> {
  return HttpRouter.use((router) =>
    Effect.gen(function* () {
      // Optional so the worker needs none; the web process relies on `Serve`
      // (programs/serve.ts) providing `WebSocketDrain.layer` beneath `Routes`.
      // Without it, `/readyz` would silently never report draining.
      const drain = yield* Effect.serviceOption(WebSocketDrain);
      const draining = Option.match(drain, {
        onNone: () => Effect.succeed(false),
        onSome: (service) => service.draining,
      });
      const verdict = Effect.gen(function* () {
        const result = yield* readiness(checks);
        if (!(yield* draining)) return result;
        return {
          status: 'failing',
          checks: { ...result.checks, draining: 'failed: draining' },
        } satisfies Readiness;
      });
      yield* router.add(
        'GET',
        '/healthz',
        HttpServerResponse.jsonUnsafe({ status: 'ok' }),
      );
      yield* router.add(
        'GET',
        '/readyz',
        Effect.map(verdict, (result) =>
          HttpServerResponse.jsonUnsafe(result, {
            status: result.status === 'failing' ? 503 : 200,
          }),
        ),
      );
    }),
  );
}
