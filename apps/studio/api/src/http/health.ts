import { Cause, Duration, Effect, type Layer, Record } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';
import type { SqlClient } from 'effect/sql';

import { deepestMessage } from '../db/errors.ts';
import { databaseAlive } from '../db/readiness.ts';
import { checkSchemaEffect, type SchemaState } from '../db/schema.ts';

export type CheckVerdict = 'ok' | 'degraded';

export type HealthCheck = Effect.Effect<CheckVerdict, unknown>;

export type HealthChecks = Readonly<Record<string, HealthCheck>>;

export type ReadinessStatus = 'ok' | 'degraded' | 'failing';

export type Readiness = {
  status: ReadinessStatus;
  checks: Record<string, string>;
};

const CHECK_TIMEOUT_MS = 1000;

function reasonOf(error: unknown): string {
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
