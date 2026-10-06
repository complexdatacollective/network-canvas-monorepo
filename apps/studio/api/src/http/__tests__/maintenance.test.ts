import { assert, it, layer } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, MutableRef } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { TestClock } from 'effect/testing';
import { describe } from 'vitest';

import { MAINTENANCE_PROBLEM_TYPE } from '@codaco/studio-contract/schema/problem';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { Database, ReadinessDatabase } from '../../db/client.ts';
import {
  type DeploymentState,
  readDeploymentState,
  setMaintenance,
} from '../../db/deployment-state.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { SCHEMA_LOCK_KEY, type SchemaState } from '../../db/schema.ts';
import { MaintenanceScope } from '../../db/tenant.ts';
import { Environment, readEnv } from '../../env.ts';
import { BootChecks } from '../../platform/boot-checks.ts';
import { MaintenanceState } from '../../platform/maintenance-state.ts';
import { SchemaStatus } from '../../platform/schema-gate.ts';
import { HealthRoutes } from '../health.ts';
import {
  maintenanceCheck,
  MaintenanceGate,
  MaintenanceTriggers,
} from '../middleware/maintenance.ts';

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
  body: {
    type: MAINTENANCE_PROBLEM_TYPE,
    title: 'Down for maintenance',
    status: 503,
  },
};

const flag = (maintenance: boolean, reason: string | null = null) =>
  MaintenanceScope.open(
    setMaintenance(
      maintenance ? { maintenance: true, reason } : { maintenance: false },
    ),
  );

const justUnderTheTtl = TestClock.adjust(Duration.millis(999));
const pastTheTtl = TestClock.adjust(Duration.millis(2));

describe.skipIf(!testDb)('the maintenance gate', () => {
  layer(TestDatabaseLive)('over a real deployment_state row', (suite) => {
    const withGate = <A, E, R>(
      control: Triggers,
      body: Effect.Effect<A, E, R>,
      booted?: MutableRef.MutableRef<boolean>,
    ) =>
      body.pipe(
        Effect.provide(
          MaintenanceTriggers.layerWith({
            ...probesOf(control),
            ...(booted === undefined
              ? {}
              : { bootPassed: Effect.sync(() => MutableRef.get(booted)) }),
          }).pipe(Layer.provide(MaintenanceState.layer)),
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
            assert.deepStrictEqual(
              yield* request('/rpc', { method: 'POST', body: '{}' }),
              REFUSAL,
            );
            assert.strictEqual(MutableRef.get(served), 0);

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

            yield* flag(false);
            assert.isFalse((yield* readDeploymentState()).maintenance);
            assert.strictEqual((yield* request('/rpc')).status, 503);
            yield* justUnderTheTtl;
            assert.strictEqual((yield* request('/rpc')).status, 503);
            assert.strictEqual(MutableRef.get(served), 0);

            yield* pastTheTtl;
            assert.strictEqual((yield* request('/rpc')).status, 200);
            assert.strictEqual(MutableRef.get(served), 1);

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
            assert.strictEqual(MutableRef.get(control.schemaReads), 0);
            assert.strictEqual((yield* request('/healthz')).status, 200);

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

    suite.effect(
      'names the operator’s window first, then the migration, the schema and the boot',
      () => {
        // Every trigger at once, lifted one at a time: readiness has to say
        // `maintenance` for as long as the flag is set, whatever else holds the
        // gate, because that is what an upgrade's deploy script watches for.
        const control = triggers();
        const booted = MutableRef.make(false);
        const served = MutableRef.make(0);
        const named = (detail: string) => ({
          status: 'failing',
          checks: { maintenance: `failed: ${detail}` },
        });
        return withGate(
          control,
          Effect.gen(function* () {
            yield* flag(true, 'Upgrading');
            MutableRef.set(control.lock, true);
            MutableRef.set(control.schema, { kind: 'absent' });
            const request = yield* openStack(served);
            const lift = (change: () => void) =>
              Effect.andThen(
                Effect.sync(change),
                TestClock.adjust(Duration.millis(1001)),
              );

            assert.deepStrictEqual(
              (yield* request('/readyz')).body,
              named('maintenance mode is on: Upgrading'),
            );

            yield* flag(false);
            yield* TestClock.adjust(Duration.millis(1001));
            assert.deepStrictEqual(
              (yield* request('/readyz')).body,
              named('a schema migration is running'),
            );

            yield* lift(() => MutableRef.set(control.lock, false));
            assert.deepStrictEqual(
              (yield* request('/readyz')).body,
              named('the database has no Studio schema'),
            );

            yield* lift(() =>
              MutableRef.set(control.schema, { kind: 'current' }),
            );
            assert.deepStrictEqual(
              (yield* request('/readyz')).body,
              named('the server is starting'),
            );
            assert.deepStrictEqual(yield* request('/rpc'), REFUSAL);
            assert.strictEqual(MutableRef.get(served), 0);

            MutableRef.set(booted, true);
            assert.strictEqual((yield* request('/rpc')).status, 200);
            assert.strictEqual(MutableRef.get(served), 1);
          }),
          booted,
        );
      },
    );
  });

  /**
   * The production wiring, `MaintenanceTriggers.layer`, over the readings a
   * deployed process takes: the real `pg_locks` probe, the real fingerprint
   * through `SchemaStatus`, and the real `deployment_state` row. Only the boot
   * checks are a switch here — their real run is `boot-refusals.test.ts`.
   */
  layer(TestDatabaseLive)('over the real probes', (suite) => {
    const Deployed = Layer.succeed(Environment, {
      ...readEnv(),
      devDefaults: false,
    });

    const ReadinessFromApp = Layer.effect(
      ReadinessDatabase,
      Effect.gen(function* () {
        return yield* Database;
      }),
    );

    const withRealProbes = <A, E, R>(
      booted: MutableRef.MutableRef<boolean>,
      body: Effect.Effect<A, E, R>,
    ) =>
      body.pipe(
        Effect.provide(
          MaintenanceTriggers.layer.pipe(
            Layer.provide(
              Layer.succeed(BootChecks)(
                BootChecks.of({
                  passed: Effect.sync(() => MutableRef.get(booted)),
                }),
              ),
            ),
            Layer.provide(MaintenanceState.layer),
            Layer.provide(
              SchemaStatus.layer.pipe(
                Layer.provide(ReadinessFromApp),
                Layer.provide(Deployed),
              ),
            ),
          ),
        ),
        Effect.scoped,
        Effect.ensuring(Effect.orDie(flag(false))),
      );

    /** What `migrate` holds, on a connection of its own, for as long as it runs. */
    const holdMigrationLock = Effect.gen(function* () {
      const { owner } = yield* TestDatabase;
      const connection = yield* owner.sql.reserve;
      yield* Effect.acquireRelease(
        connection.executeUnprepared(
          `select pg_advisory_lock(${SCHEMA_LOCK_KEY})`,
          [],
          undefined,
        ),
        () =>
          Effect.orDie(
            connection.executeUnprepared(
              `select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`,
              [],
              undefined,
            ),
          ),
      );
    });

    const stamp = (fingerprint: string) =>
      Effect.gen(function* () {
        const { owner } = yield* TestDatabase;
        yield* owner.sql`update "schemaFingerprint" set "fingerprint" = ${fingerprint}`;
      });

    suite.effect(
      'refuses while migrate holds the advisory lock, and reopens once it lets go',
      () => {
        const booted = MutableRef.make(true);
        const served = MutableRef.make(0);
        return withRealProbes(
          booted,
          Effect.gen(function* () {
            const request = yield* openStack(served);
            assert.strictEqual((yield* request('/rpc')).status, 200);

            yield* Effect.scoped(
              Effect.gen(function* () {
                yield* holdMigrationLock;
                yield* TestClock.adjust(Duration.millis(1001));
                assert.deepStrictEqual(yield* request('/rpc'), REFUSAL);
                assert.deepStrictEqual((yield* request('/readyz')).body, {
                  status: 'failing',
                  checks: {
                    maintenance: 'failed: a schema migration is running',
                  },
                });
              }),
            );
            assert.strictEqual(MutableRef.get(served), 1);

            yield* TestClock.adjust(Duration.millis(1001));
            assert.strictEqual((yield* request('/rpc')).status, 200);
            assert.strictEqual(MutableRef.get(served), 2);
          }),
        );
      },
    );

    suite.effect(
      'refuses a database another build stamped, with no flag, and reopens once it is current',
      () => {
        const booted = MutableRef.make(true);
        const served = MutableRef.make(0);
        return withRealProbes(
          booted,
          Effect.gen(function* () {
            const request = yield* openStack(served);
            yield* Effect.acquireRelease(stamp('an-older-build'), () =>
              Effect.orDie(stamp(SCHEMA_FINGERPRINT)),
            );

            assert.deepStrictEqual(yield* request('/api/v1/studies'), REFUSAL);
            assert.deepStrictEqual((yield* request('/readyz')).body, {
              status: 'failing',
              checks: {
                maintenance: 'failed: the database schema is not this build’s',
              },
            });
            assert.strictEqual(MutableRef.get(served), 0);

            yield* stamp(SCHEMA_FINGERPRINT);
            yield* TestClock.adjust(Duration.millis(1001));
            assert.strictEqual((yield* request('/api/v1/studies')).status, 200);
            assert.strictEqual(MutableRef.get(served), 1);
          }),
        );
      },
    );

    suite.effect(
      'stays closed while the boot checks run, though every reading says open',
      () => {
        // A fresh install's first seconds: no flag, no lock, a current schema
        // as far as any reading can tell — and a keyring nobody has checked.
        const booted = MutableRef.make(false);
        const served = MutableRef.make(0);
        return withRealProbes(
          booted,
          Effect.gen(function* () {
            const request = yield* openStack(served);
            for (const path of REFUSED) {
              assert.deepStrictEqual(yield* request(path), REFUSAL, path);
            }
            assert.strictEqual(MutableRef.get(served), 0);
            assert.deepStrictEqual((yield* request('/readyz')).body, {
              status: 'failing',
              checks: { maintenance: 'failed: the server is starting' },
            });
            assert.strictEqual((yield* request('/healthz')).status, 200);

            yield* flag(true, 'Upgrading');
            yield* TestClock.adjust(Duration.millis(1001));
            assert.deepStrictEqual((yield* request('/readyz')).body, {
              status: 'failing',
              checks: {
                maintenance: 'failed: maintenance mode is on: Upgrading',
              },
            });

            // The checks pass inside the operator's window: the flag still
            // holds the gate until it is cleared.
            MutableRef.set(booted, true);
            assert.deepStrictEqual(yield* request('/rpc'), REFUSAL);
            yield* flag(false);
            yield* TestClock.adjust(Duration.millis(1001));
            assert.strictEqual((yield* request('/rpc')).status, 200);
            assert.strictEqual(MutableRef.get(served), 1);
          }),
        );
      },
    );
  });
});

describe('a flag that cannot be read', () => {
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
        yield* TestClock.adjust(Duration.millis(499));
        assert.isUndefined(pending.pollUnsafe());
        yield* TestClock.adjust(Duration.millis(1));
        assert.strictEqual((yield* Fiber.join(pending)).status, 200);
      }),
    );
  });
});
