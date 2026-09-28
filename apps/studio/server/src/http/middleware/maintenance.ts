import { Context, Effect, Layer, Option } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

import { Database } from '../../db/client.ts';
import { migrationLockHeld } from '../../db/readiness.ts';
import type { SchemaState } from '../../db/schema.ts';
import {
  cachedReading,
  MaintenanceState,
} from '../../platform/maintenance-state.ts';
import { SchemaStatus } from '../../platform/schema-gate.ts';
import type { CheckVerdict, HealthCheck } from '../health.ts';

// Maintenance mode on the web process (#1901): while it is on, every request
// but the two health routes is answered `503` with `Retry-After` and runs
// nothing — no procedure, no upgrade, no storage read, nothing the Hono residue
// would have done. The client shell renders its maintenance state from that
// 503, and readiness fails naming `maintenance`, so a deployment stops routing
// here for the whole window. The gate sees requests, and a socket upgraded
// before the window is no longer one: `http/ws-bridge.ts` watches the same
// reading and closes it.
//
// Three things close the instance, and only the first is a decision anybody
// made (#1901, "the same page is served automatically, without the flag"):
//
//   1. the flag — `deployment_state`, set by `studio-api maintenance on`;
//   2. a migration running — some backend holds the schema's advisory lock;
//   3. a schema that is not this build's — a half-upgraded database is never
//      served.
//
// They are checked in that order, cheapest and most decisive first, and each
// stops the walk: a closed instance does not go on to ask the next question.
// The order is also what keeps the schema read out of a migration's way. That
// read goes to `schemaFingerprint`, which a migration's DDL holds
// `ACCESS EXCLUSIVE` until it commits, and a caller that gives up on it
// interrupts its fiber, not its statement (`db/readiness.ts`). The lock is
// taken before any DDL and released after the commit (`db/migrate.ts`,
// `scripts/apply.ts`), so while a migration can be holding that table the lock
// probe has already answered and the schema is not read at all. What is left
// is a request that read the lock a moment before a migration took it: its one
// schema read waits behind the DDL, bounded for the caller, and every later
// reading sees the lock.
//
// Every trigger is a `cachedReading` (`platform/maintenance-state.ts`): at most
// a second old, shared by every concurrent request, bounded, and never
// failing. A trigger that cannot be read answers the last thing it read — see
// there for why a failed read closes nothing.

/** Why the instance is closed, for readiness to name. */
export type Closure = {
  readonly trigger: 'maintenance' | 'migration' | 'schema';
  readonly detail: string;
};

/** What `schema` answers before its first read: nothing to close for. */
const CURRENT: SchemaState = { kind: 'current' };

export class MaintenanceTriggers extends Context.Service<
  MaintenanceTriggers,
  {
    /** `None` when the instance may serve; the first trigger that holds otherwise. */
    readonly closure: Effect.Effect<Option.Option<Closure>>;
  }
>()('@studio/http/MaintenanceTriggers') {
  /**
   * The three triggers over the two probes that are not the flag. The probes
   * are taken as Effects, so a suite can stand in a held lock, a stale schema
   * or a probe that never answers without building a migration to get one.
   */
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

  /**
   * The web process's: the lock probe on the application client and the
   * schema verdict the process already reads for `/readyz`.
   *
   * The lock probe is a bare statement, outside any scope, so on rc.115 it
   * runs as the connecting login rather than the application role (fallback A,
   * `db/client.ts`). That is harmless here: `pg_locks` and `pg_database` are
   * readable by every role, and the probe reads nothing of Studio's.
   */
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

  /**
   * A process with no database has no flag to read, no lock to watch and no
   * schema to go stale, so nothing closes it.
   */
  static readonly layerOpen: Layer.Layer<MaintenanceTriggers> = Layer.succeed(
    MaintenanceTriggers,
  )(MaintenanceTriggers.of({ closure: Effect.succeedNone }));
}

/**
 * Readiness's `maintenance` check: `failed` whenever the gate would refuse,
 * naming the trigger. An instance that answers every request with a 503 is not
 * ready for traffic, whichever of the three closed it — so a migration or a
 * stale schema fail this check too, not only the flag, and a load balancer
 * reading `/readyz` stops sending requests the gate would only refuse.
 */
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
 * Matched on the path alone and exactly: a query string does not change which
 * route answers, so `/readyz?verbose` stays exempt, but nothing else is —
 * not `/readyz/`, not `/healthzzz`, and not a differently cased spelling, even
 * where the router would resolve one of those to a health route. Refusing a
 * health check spelled oddly costs nothing; exempting one path too many would
 * serve a surface through the window.
 */
const EXEMPT: ReadonlySet<string> = new Set(['/healthz', '/readyz']);

const pathOf = (url: string): string => {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
};

/** The refusal: problem JSON like the rest of the server, and when to come back. */
const MAINTENANCE_RESPONSE = HttpServerResponse.jsonUnsafe(
  { title: 'Down for maintenance', status: 503 },
  {
    status: 503,
    contentType: 'application/problem+json',
    headers: { 'retry-after': '30' },
  },
);

/**
 * The gate, as a global middleware: it wraps dispatch itself, so it runs
 * before any route is matched and has to exempt the health routes by path
 * rather than by being registered after them (`http/router.ts`). It answers
 * with a response rather than failing, because a global middleware may not
 * handle errors and a refusal nobody can read is not a refusal.
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
