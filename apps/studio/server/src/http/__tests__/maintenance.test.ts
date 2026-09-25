import { assert, it, layer } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, MutableRef } from 'effect';
import { TestClock } from 'effect/testing';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { describe } from 'vitest';

import { TestDatabaseLive, testDb } from '../../__tests__/support/database.ts';
import {
  type DeploymentState,
  readDeploymentState,
  setMaintenance,
} from '../../db/deployment-state.ts';
import type { SchemaState } from '../../db/schema.ts';
import { MaintenanceScope } from '../../db/tenant.ts';
import { MaintenanceState } from '../../platform/maintenance-state.ts';
import { HealthRoutes } from '../health.ts';
import {
  maintenanceCheck,
  MaintenanceGate,
  MaintenanceTriggers,
} from '../middleware/maintenance.ts';

// The web process's maintenance gate (#1901), on the test clock: the flag is a
// real `deployment_state` row in a scratch schema, written the way `studio-api
// maintenance` writes it and read the way the serve program reads it
// (`MaintenanceState.layer`, the application role). The lock and schema
// triggers are stood in by references a case flips, because their subject here
// is what the gate does with an answer; the probes themselves are
// `db/__tests__/readiness.test.ts`'s.
//
// Behind the gate is a catch-all that counts every request it serves — the
// shape of the Hono residue, which answers everything nothing else claimed —
// so "and runs nothing" is a number rather than an absence.

/** The paths a closed instance must refuse: every surface, and near misses of the two it must not. */
const REFUSED = [
  '/rpc',
  '/ws',
  '/api/v1/studies',
  '/storage/abc123',
  '/setup',
  '/',
  '/healthzzz',
  '/healthz/extra',
  '/readyz/',
  '/READYZ',
] as const;

type Triggers = {
  readonly lock: MutableRef.MutableRef<boolean>;
  readonly schema: MutableRef.MutableRef<SchemaState>;
  /** How many times the schema trigger was actually asked. */
  readonly schemaReads: MutableRef.MutableRef<number>;
};

const triggers = (): Triggers => ({
  lock: MutableRef.make(false),
  schema: MutableRef.make<SchemaState>({ kind: 'current' }),
  schemaReads: MutableRef.make(0),
});

const probesOf = (control: Triggers) => ({
  lockHeld: Effect.sync(() => MutableRef.get(control.lock)),
  schema: Effect.sync(() => {
    MutableRef.update(control.schemaReads, (reads) => reads + 1);
    return MutableRef.get(control.schema);
  }),
});

/** Everything the gate stands in front of, counting what it serves. */
const Surface = (served: MutableRef.MutableRef<number>) =>
  HttpRouter.use((router) =>
    router.add(
      '*',
      '/*',
      Effect.sync(() => {
        MutableRef.update(served, (count) => count + 1);
        return HttpServerResponse.text('served');
      }),
    ),
  );

type Answer = {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly contentType: string | null;
  readonly body: unknown;
};

/**
 * The stack in `http/router.ts`'s order — the gate first, then the health
 * routes, then everything else — with readiness reading the same triggers the
 * gate does, as the serve program wires it. Returns a way to issue a request
 * and read what came back.
 */
const openStack = Effect.fnUntraced(function* (
  served: MutableRef.MutableRef<number>,
) {
  const closure = yield* MaintenanceTriggers;
  const handler = yield* HttpRouter.toHttpEffect(
    Surface(served).pipe(
      Layer.provideMerge(
        HealthRoutes({ maintenance: maintenanceCheck(closure) }),
      ),
      Layer.provideMerge(MaintenanceGate),
    ),
  );
  return (path: string, init?: RequestInit) =>
    handler.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(
          new Request(new URL(path, 'http://studio.test'), init),
        ),
      ),
      Effect.scoped,
      Effect.flatMap((response) => {
        const web = HttpServerResponse.toWeb(response);
        return Effect.promise(async (): Promise<Answer> => {
          const text = await web.text();
          const contentType = web.headers.get('content-type');
          return {
            status: web.status,
            retryAfter: web.headers.get('retry-after'),
            contentType,
            body: contentType?.includes('json') ? JSON.parse(text) : text,
          };
        });
      }),
    );
});

const REFUSAL = {
  status: 503,
  retryAfter: '30',
  contentType: 'application/problem+json',
  body: { title: 'Down for maintenance', status: 503 },
};

/** Enters or leaves the window as the command does, on the maintenance role. */
const flag = (maintenance: boolean, reason: string | null = null) =>
  MaintenanceScope.open(
    setMaintenance(
      maintenance ? { maintenance: true, reason } : { maintenance: false },
    ),
  );

/** One second of the cache, and the millisecond that ends it. */
const justUnderTheTtl = TestClock.adjust(Duration.millis(999));
const pastTheTtl = TestClock.adjust(Duration.millis(2));

describe.skipIf(!testDb)('the maintenance gate', () => {
  layer(TestDatabaseLive)('over a real deployment_state row', (suite) => {
    /**
     * The gate over the serve program's flag and stand-in triggers, built per
     * case so no cache outlives it; the flag is put back however the case
     * ends, because the scratch schema is shared.
     */
    const withGate = <A, E, R>(
      control: Triggers,
      body: Effect.Effect<A, E, R>,
    ) =>
      body.pipe(
        Effect.provide(
          MaintenanceTriggers.layerWith(probesOf(control)).pipe(
            Layer.provide(MaintenanceState.layer),
          ),
        ),
        Effect.scoped,
        Effect.ensuring(Effect.orDie(flag(false))),
      );

    suite.effect(
      'refuses every surface while the flag is set, and runs none of them',
      () => {
        const control = triggers();
        const served = MutableRef.make(0);
        return withGate(
          control,
          Effect.gen(function* () {
            yield* flag(true, 'Upgrading to 0.3');
            const request = yield* openStack(served);

            for (const path of REFUSED) {
              assert.deepStrictEqual(yield* request(path), REFUSAL, path);
            }
            // A write is refused like a read: nothing behind the gate is asked.
            assert.deepStrictEqual(
              yield* request('/rpc', { method: 'POST', body: '{}' }),
              REFUSAL,
            );
            assert.strictEqual(MutableRef.get(served), 0);

            // Liveness is untouched, byte for byte, query string or not.
            for (const path of ['/healthz', '/healthz?probe=1']) {
              assert.deepStrictEqual(
                yield* request(path),
                {
                  status: 200,
                  retryAfter: null,
                  contentType: 'application/json',
                  body: { status: 'ok' },
                },
                path,
              );
            }
            // Readiness answers — it is exempt — and fails naming maintenance
            // and the operator's reason, with or without a query string.
            for (const path of ['/readyz', '/readyz?verbose']) {
              assert.deepStrictEqual(
                yield* request(path),
                {
                  status: 503,
                  retryAfter: null,
                  contentType: 'application/json',
                  body: {
                    status: 'failing',
                    checks: {
                      maintenance:
                        'failed: maintenance mode is on: Upgrading to 0.3',
                    },
                  },
                },
                path,
              );
            }
            // The flag decided it: the later triggers were never asked.
            assert.strictEqual(MutableRef.get(control.schemaReads), 0);
          }),
        );
      },
    );

    suite.effect('serves every surface once the flag is clear', () => {
      const control = triggers();
      const served = MutableRef.make(0);
      return withGate(
        control,
        Effect.gen(function* () {
          const request = yield* openStack(served);
          for (const path of ['/rpc', '/storage/abc123', '/healthzzz']) {
            const answer = yield* request(path);
            assert.strictEqual(answer.status, 200, path);
            assert.strictEqual(answer.body, 'served', path);
          }
          assert.strictEqual(MutableRef.get(served), 3);
          assert.deepStrictEqual((yield* request('/readyz')).body, {
            status: 'ok',
            checks: { maintenance: 'ok' },
          });
        }),
      );
    });

    suite.effect(
      'honours a cleared flag only once the second-long cache has expired',
      () => {
        const control = triggers();
        const served = MutableRef.make(0);
        return withGate(
          control,
          Effect.gen(function* () {
            yield* flag(true, 'Upgrading');
            const request = yield* openStack(served);
            assert.strictEqual((yield* request('/rpc')).status, 503);

            // `maintenance off` has committed, and the row says so...
            yield* flag(false);
            assert.isFalse((yield* readDeploymentState()).maintenance);
            // ...but the gate answers from the reading it took, for a second.
            assert.strictEqual((yield* request('/rpc')).status, 503);
            yield* justUnderTheTtl;
            assert.strictEqual((yield* request('/rpc')).status, 503);
            assert.strictEqual(MutableRef.get(served), 0);

            yield* pastTheTtl;
            assert.strictEqual((yield* request('/rpc')).status, 200);
            assert.strictEqual(MutableRef.get(served), 1);

            // And the other way: a window opened under a fresh reading waits
            // out that reading too.
            yield* flag(true, 'Again');
            assert.strictEqual((yield* request('/rpc')).status, 200);
            yield* TestClock.adjust(Duration.millis(1001));
            assert.strictEqual((yield* request('/rpc')).status, 503);
          }),
        );
      },
    );

    suite.effect(
      'refuses while a migration holds the lock, with no flag',
      () => {
        const control = triggers();
        const served = MutableRef.make(0);
        return withGate(
          control,
          Effect.gen(function* () {
            MutableRef.set(control.lock, true);
            const request = yield* openStack(served);
            assert.deepStrictEqual(yield* request('/rpc'), REFUSAL);
            assert.strictEqual(MutableRef.get(served), 0);
            assert.deepStrictEqual((yield* request('/readyz')).body, {
              status: 'failing',
              checks: { maintenance: 'failed: a schema migration is running' },
            });
            // The lock decided it: the schema, which a migration's DDL holds, is
            // not read behind it.
            assert.strictEqual(MutableRef.get(control.schemaReads), 0);
            assert.strictEqual((yield* request('/healthz')).status, 200);

            // The migration finishes: open again once the reading expires.
            MutableRef.set(control.lock, false);
            yield* TestClock.adjust(Duration.millis(1001));
            assert.strictEqual((yield* request('/rpc')).status, 200);
          }),
        );
      },
    );

    suite.effect(
      'refuses a database whose schema is not this build’s, with no flag',
      () => {
        const control = triggers();
        const served = MutableRef.make(0);
        return withGate(
          control,
          Effect.gen(function* () {
            MutableRef.set(control.schema, {
              kind: 'stale',
              reason: 'mismatch',
              found: 'an-older-build',
              appliedAt: null,
            });
            const request = yield* openStack(served);
            assert.deepStrictEqual(yield* request('/api/v1/studies'), REFUSAL);
            assert.strictEqual(MutableRef.get(served), 0);
            assert.deepStrictEqual((yield* request('/readyz')).body, {
              status: 'failing',
              checks: {
                maintenance: 'failed: the database schema is not this build’s',
              },
            });

            MutableRef.set(control.schema, { kind: 'absent' });
            yield* TestClock.adjust(Duration.millis(1001));
            assert.deepStrictEqual((yield* request('/readyz')).body, {
              status: 'failing',
              checks: {
                maintenance: 'failed: the database has no Studio schema',
              },
            });
          }),
        );
      },
    );
  });
});

describe('a flag that cannot be read', () => {
  // The flag read's failure modes, on stand-ins for the row. A failed or hung
  // read answers the last flag it read — off, before any — so it neither
  // invents a window nor forgets one it saw, and no request waits on it for
  // longer than the reading's half-second bound.

  type Mode = 'on' | 'off' | 'fails' | 'hangs';

  const rowFor = (maintenance: boolean): DeploymentState => ({
    maintenance,
    reason: maintenance ? 'Upgrading' : null,
    updatedAt: new Date(0),
  });

  const READS: Record<Mode, Effect.Effect<DeploymentState, Error>> = {
    on: Effect.succeed(rowFor(true)),
    off: Effect.succeed(rowFor(false)),
    fails: Effect.fail(new Error('connect ECONNREFUSED')),
    hangs: Effect.never,
  };

  const readFor = (mode: MutableRef.MutableRef<Mode>) =>
    Effect.suspend(() => READS[MutableRef.get(mode)]);

  const withFlagRead = <A, E, R>(
    mode: MutableRef.MutableRef<Mode>,
    body: Effect.Effect<A, E, R>,
  ) =>
    body.pipe(
      Effect.provide(
        MaintenanceTriggers.layerWith(probesOf(triggers())).pipe(
          Layer.provide(MaintenanceState.layerFrom(readFor(mode))),
        ),
      ),
      Effect.scoped,
    );

  /** A request that may have to wait out the bound, on the test clock. */
  const boundedBy = <A, E, R>(request: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const pending = yield* Effect.forkChild(request);
      yield* TestClock.adjust(Duration.millis(500));
      return yield* Fiber.join(pending);
    });

  it.effect(
    'keeps the window it last saw through failed and hung reads',
    () => {
      const mode = MutableRef.make<Mode>('on');
      const served = MutableRef.make(0);
      return withFlagRead(
        mode,
        Effect.gen(function* () {
          const request = yield* openStack(served);
          assert.strictEqual((yield* request('/rpc')).status, 503);

          MutableRef.set(mode, 'fails');
          yield* TestClock.adjust(Duration.millis(1001));
          assert.strictEqual((yield* request('/rpc')).status, 503);

          MutableRef.set(mode, 'hangs');
          yield* TestClock.adjust(Duration.millis(1001));
          assert.strictEqual((yield* boundedBy(request('/rpc'))).status, 503);
          assert.deepStrictEqual((yield* request('/readyz')).body, {
            status: 'failing',
            checks: {
              maintenance: 'failed: maintenance mode is on: Upgrading',
            },
          });
          assert.strictEqual(MutableRef.get(served), 0);

          // Readable again, and off: the gate follows it.
          MutableRef.set(mode, 'off');
          yield* TestClock.adjust(Duration.millis(1001));
          assert.strictEqual((yield* request('/rpc')).status, 200);
        }),
      );
    },
  );

  it.effect(
    'serves when the flag has never been read, rather than inventing a window',
    () => {
      const mode = MutableRef.make<Mode>('hangs');
      const served = MutableRef.make(0);
      return withFlagRead(
        mode,
        Effect.gen(function* () {
          const request = yield* openStack(served);
          assert.strictEqual((yield* boundedBy(request('/rpc'))).status, 200);
          MutableRef.set(mode, 'fails');
          yield* TestClock.adjust(Duration.millis(1001));
          assert.strictEqual((yield* request('/rpc')).status, 200);
          assert.strictEqual(MutableRef.get(served), 2);
        }),
      );
    },
  );

  it.effect('does not wait on a hung read past its bound', () => {
    const mode = MutableRef.make<Mode>('hangs');
    const served = MutableRef.make(0);
    return withFlagRead(
      mode,
      Effect.gen(function* () {
        const request = yield* openStack(served);
        const pending = yield* Effect.forkChild(request('/rpc'));
        // Just short of the bound the request is still waiting on the read...
        yield* TestClock.adjust(Duration.millis(499));
        assert.isUndefined(pending.pollUnsafe());
        // ...and at the bound it is answered without it.
        yield* TestClock.adjust(Duration.millis(1));
        assert.strictEqual((yield* Fiber.join(pending)).status, 200);
      }),
    );
  });
});
