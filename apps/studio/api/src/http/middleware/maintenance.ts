import { Context, Effect, Layer, Option } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { Database } from '../../db/client.ts';
import { migrationLockHeld } from '../../db/readiness.ts';
import type { SchemaState } from '../../db/schema.ts';
import {
  cachedReading,
  MaintenanceState,
} from '../../platform/maintenance-state.ts';
import { SchemaStatus } from '../../platform/schema-gate.ts';
import type { CheckVerdict, HealthCheck } from '../health.ts';

// Triggers are checked flag, lock, schema, and each stops the walk: the order
// keeps the schema read, which a migration's DDL holds, out of a migration's way.

export type Closure = {
  readonly trigger: 'maintenance' | 'migration' | 'schema';
  readonly detail: string;
};

const CURRENT: SchemaState = { kind: 'current' };

export class MaintenanceTriggers extends Context.Service<
  MaintenanceTriggers,
  {
    readonly closure: Effect.Effect<Option.Option<Closure>>;
  }
>()('@studio/http/MaintenanceTriggers') {
  static readonly layerWith = (probes: {
    readonly lockHeld: Effect.Effect<boolean, unknown>;
    readonly schema: Effect.Effect<SchemaState, unknown>;
  }): Layer.Layer<MaintenanceTriggers, never, MaintenanceState> =>
    Layer.effect(
      MaintenanceTriggers,
      Effect.gen(function* () {
        const state = yield* MaintenanceState;
        const lockHeld = yield* cachedReading({
          name: 'the migration lock',
          read: probes.lockHeld,
          initial: false,
        });
        const schema = yield* cachedReading({
          name: 'the schema fingerprint',
          read: probes.schema,
          initial: CURRENT,
        });

        const closure = Effect.gen(function* () {
          const flag = yield* state.read;
          if (flag.maintenance) {
            return Option.some<Closure>({
              trigger: 'maintenance',
              detail:
                flag.reason === null
                  ? 'maintenance mode is on'
                  : `maintenance mode is on: ${flag.reason}`,
            });
          }
          if (yield* lockHeld) {
            return Option.some<Closure>({
              trigger: 'migration',
              detail: 'a schema migration is running',
            });
          }
          const verdict = yield* schema;
          if (verdict.kind !== 'current') {
            return Option.some<Closure>({
              trigger: 'schema',
              detail:
                verdict.kind === 'absent'
                  ? 'the database has no Studio schema'
                  : 'the database schema is not this build’s',
            });
          }
          return Option.none<Closure>();
        });

        return MaintenanceTriggers.of({ closure });
      }),
    );

  static readonly layer: Layer.Layer<
    MaintenanceTriggers,
    never,
    MaintenanceState | SchemaStatus | Database
  > = Layer.unwrap(
    Effect.gen(function* () {
      const { sql } = yield* Database;
      const status = yield* SchemaStatus;
      return MaintenanceTriggers.layerWith({
        lockHeld: migrationLockHeld(sql),
        schema: status.read,
      });
    }),
  );

  static readonly layerOpen: Layer.Layer<MaintenanceTriggers> = Layer.succeed(
    MaintenanceTriggers,
  )(MaintenanceTriggers.of({ closure: Effect.succeedNone }));
}

export const maintenanceCheck = (
  triggers: MaintenanceTriggers['Service'],
): HealthCheck =>
  Effect.flatMap(triggers.closure, (closure) =>
    Option.match(closure, {
      onNone: () => Effect.succeed<CheckVerdict>('ok'),
      onSome: ({ detail }) => Effect.fail(new Error(detail)),
    }),
  );

/**
 * Matched on the path alone and exactly: exempting one path too many would
 * serve a surface through the window.
 */
const EXEMPT: ReadonlySet<string> = new Set(['/healthz', '/readyz']);

const pathOf = (url: string): string => {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
};

const MAINTENANCE_RESPONSE = HttpServerResponse.jsonUnsafe(
  { title: 'Down for maintenance', status: 503 },
  {
    status: 503,
    contentType: 'application/problem+json',
    headers: { 'retry-after': '30' },
  },
);

/**
 * Answers with a response rather than failing: a global middleware may not
 * handle errors.
 */
export const MaintenanceGate: Layer.Layer<
  never,
  never,
  HttpRouter.HttpRouter | MaintenanceTriggers
> = HttpRouter.middleware(
  Effect.gen(function* () {
    const triggers = yield* MaintenanceTriggers;
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (EXEMPT.has(pathOf(request.url))) return yield* httpEffect;
        const closure = yield* triggers.closure;
        if (Option.isNone(closure)) return yield* httpEffect;
        return MAINTENANCE_RESPONSE;
      });
  }),
  { global: true },
);
