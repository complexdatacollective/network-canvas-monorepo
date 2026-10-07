import { Context, Effect, Exit, Layer, Option, Ref } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { MAINTENANCE_PROBLEM_TYPE } from '@codaco/studio-contract/schema/problem';

import { Database } from '../../db/client.ts';
import { migrationLockHeld } from '../../db/readiness.ts';
import type { SchemaState } from '../../db/schema.ts';
import { BootChecks } from '../../platform/boot-checks.ts';
import {
  cachedReading,
  MaintenanceState,
  READING_BOUND,
} from '../../platform/maintenance-state.ts';
import { SchemaStatus } from '../../platform/schema-gate.ts';
import type { CheckVerdict, HealthCheck } from '../health.ts';

// Triggers are checked flag, lock, schema, starting, and each stops the walk:
// the order keeps the schema read, which a migration's DDL holds, out of a
// migration's way, and names the operator's window before anything automatic,
// so readiness says `maintenance` for as long as the flag is set. `starting`
// is last because it reads nothing from the database: it is what keeps the
// gate closed when every reading above has failed open.
//
// A closure the flag or the lock shut reopens only on a schema read taken
// after it lifted. Nothing reads the schema while either is in force, which is
// exactly when a migration runs, so the last schema reading is what was true
// before: "current" for this build, which the migration may have made untrue.
// A failed or slow reading answers that last value, so the first read after a
// closure bypasses the cached reading, and one that fails or is slow keeps the
// gate shut rather than reopening it on the old value.

export type Closure = {
  readonly trigger: 'maintenance' | 'migration' | 'schema' | 'starting';
  readonly detail: string;
};

const CURRENT: SchemaState = { kind: 'current' };

const PASSED = Effect.succeed(true);

export class MaintenanceTriggers extends Context.Service<
  MaintenanceTriggers,
  {
    readonly closure: Effect.Effect<Option.Option<Closure>>;
  }
>()('@studio/http/MaintenanceTriggers') {
  /**
   * @param probes.bootPassed whether the process has finished its boot checks
   * (`BootChecks`). Left out, the process counts as started, which only a test
   * of the other triggers wants; `layer` always passes it.
   */
  static readonly layerWith = (probes: {
    readonly lockHeld: Effect.Effect<boolean, unknown>;
    readonly schema: Effect.Effect<SchemaState, unknown>;
    readonly bootPassed?: Effect.Effect<boolean>;
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
        // Counts the closures the flag or the lock has answered, and the
        // count a schema read succeeded after: the schema is unread since a
        // closure while the first is ahead. A read in flight when a new
        // closure comes answers only for the closures before it.
        const closures = yield* Ref.make(0);
        const readAfter = yield* Ref.make(0);
        const bootPassed = probes.bootPassed ?? PASSED;

        /**
         * Reads the schema afresh, bypassing the cached reading, and puts what
         * it read there in place of the value from before the closure.
         * Nothing when the read fails or is slow.
         */
        const rereadSchema = Effect.gen(function* () {
          const since = yield* Ref.get(closures);
          const read = yield* Effect.exit(
            probes.schema.pipe(Effect.timeout(READING_BOUND)),
          );
          if (Exit.isFailure(read)) return Option.none<SchemaState>();
          yield* schema.seed(read.value);
          yield* Ref.update(readAfter, (count) => Math.max(count, since));
          return Option.some(read.value);
        });

        const closed = (closure: Closure) =>
          Effect.as(
            Ref.update(closures, (count) => count + 1),
            Option.some(closure),
          );

        const closure = Effect.gen(function* () {
          const flag = yield* state.read;
          if (flag.maintenance) {
            return yield* closed({
              trigger: 'maintenance',
              detail:
                flag.reason === null
                  ? 'maintenance mode is on'
                  : `maintenance mode is on: ${flag.reason}`,
            });
          }
          if (yield* lockHeld.read) {
            return yield* closed({
              trigger: 'migration',
              detail: 'a schema migration is running',
            });
          }
          const unread =
            (yield* Ref.get(closures)) > (yield* Ref.get(readAfter));
          const verdict = unread
            ? yield* rereadSchema
            : Option.some(yield* schema.read);
          if (Option.isNone(verdict)) {
            return Option.some<Closure>({
              trigger: 'schema',
              detail:
                'the schema has not been read since maintenance mode or a migration',
            });
          }
          if (verdict.value.kind !== 'current') {
            return Option.some<Closure>({
              trigger: 'schema',
              detail:
                verdict.value.kind === 'absent'
                  ? 'the database has no Studio schema'
                  : 'the database schema is not this build’s',
            });
          }
          if (!(yield* bootPassed)) {
            return Option.some<Closure>({
              trigger: 'starting',
              detail: 'the server is starting',
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
    MaintenanceState | SchemaStatus | BootChecks | Database
  > = Layer.unwrap(
    Effect.gen(function* () {
      const { sql } = yield* Database;
      const status = yield* SchemaStatus;
      const boot = yield* BootChecks;
      return MaintenanceTriggers.layerWith({
        lockHeld: migrationLockHeld(sql),
        schema: status.read,
        bootPassed: boot.passed,
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
  {
    type: MAINTENANCE_PROBLEM_TYPE,
    title: 'Down for maintenance',
    status: 503,
  },
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
