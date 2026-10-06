// A deployment that has never been provisioned: its cluster has no Studio
// roles, so every connection the api makes as `studio_app` is refused with
// "role does not exist". This is the first-install case, and the one an upgrade
// onto a fresh cluster is (#1901): the api waits, closed, for `migrate` to
// create the roles and the schema.
//
// The cluster these suites share always has the roles, and a cluster-wide role
// cannot be dropped from it. So the connection asks for a role that this
// cluster does not have, `studio_app_absent`: Postgres refuses it with the
// same SQLSTATE and the same sentence, through the same driver, as it refuses
// `studio_app` on a cluster that was never provisioned. A run of the deployed
// entrypoint against a throwaway cluster with no roles at all gave the same
// readings; this test is the part of that run that can live in the suite.
import { PgClient } from '@effect/sql-pg';
import { assert, describe, it } from '@effect/vitest';
import {
  DefaultServices,
  make as makeDrizzle,
} from 'drizzle-orm/effect-postgres';
import {
  Cause,
  Effect,
  Layer,
  Logger,
  References,
  Redacted,
  Context,
} from 'effect';
import { Reactivity } from 'effect/reactivity';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { testDb } from '../../__tests__/support/database.ts';
import {
  Database,
  type DatabaseService,
  ReadinessDatabase,
} from '../../db/client.ts';
import { migrationLockHeld } from '../../db/readiness.ts';
import { Environment, readEnv } from '../../env.ts';
import { databaseCheck, readiness, schemaCheck } from '../../http/health.ts';
import {
  maintenanceCheck,
  MaintenanceTriggers,
} from '../../http/middleware/maintenance.ts';
import { JobClock } from '../../jobs/clock.ts';
import { cachedReading, MaintenanceState } from '../maintenance-state.ts';
import { SchemaStatus } from '../schema-gate.ts';

const ABSENT_ROLE = `${TENANT_ROLES.app}_absent`;

const STACK_FRAME = /^\s+at /m;

const rolelessService = (url: string) =>
  Effect.gen(function* () {
    const sql = yield* PgClient.make({
      url: Redacted.make(url),
      maxConnections: 1,
      connectTimeout: '10 seconds',
      startupParameters: { role: ABSENT_ROLE },
    });
    const db = yield* makeDrizzle().pipe(
      Effect.provideService(PgClient.PgClient, sql),
      Effect.provide(DefaultServices),
    );
    return { identity: 'app', sql, db } satisfies DatabaseService;
  });

const text = (message: unknown): string =>
  (Array.isArray(message) ? message : [message])
    .map((part) => (Cause.isCause(part) ? Cause.pretty(part) : String(part)))
    .join(' ');

type Captured = { level: string; text: string };

const capture = () => {
  const lines: Captured[] = [];
  const layer = Logger.layer([
    Logger.make<unknown, void>(({ logLevel, message, cause }) => {
      lines.push({
        level: logLevel,
        text: [text(message), cause === undefined ? '' : Cause.pretty(cause)]
          .join(' ')
          .trim(),
      });
    }),
  ]);
  return { lines, layer };
};

describe.skipIf(!testDb)(
  'an api that waits on a cluster with no Studio roles',
  () => {
    const rolelessDatabase = (url: string) =>
      Layer.mergeAll(
        Layer.effect(Database, rolelessService(url)),
        Layer.effect(ReadinessDatabase, rolelessService(url)),
      ).pipe(Layer.provide(Reactivity.layer));

    const world = (url: string) =>
      Layer.mergeAll(
        SchemaStatus.layer,
        JobClock.layerApplication({ clockMonitorInterval: '1 hour' }),
        MaintenanceState.layer,
      ).pipe(
        Layer.provideMerge(rolelessDatabase(url)),
        Layer.provide(
          Layer.succeed(Environment, {
            ...readEnv(),
            devDefaults: false,
          }),
        ),
      );

    it.live(
      'logs one warning, without a stack, and `/readyz` names the state rather than the driver’s error',
      () => {
        const logs = capture();
        return Effect.scoped(
          Effect.gen(function* () {
            if (!testDb)
              throw new Error('unreachable: probe guaranteed a database');
            const context = yield* Layer.build(world(testDb.url));
            const status = Context.get(context, SchemaStatus);
            const state = Context.get(context, MaintenanceState);
            const { sql } = Context.get(context, ReadinessDatabase);

            const triggers = yield* Layer.build(
              MaintenanceTriggers.layerWith({
                lockHeld: migrationLockHeld(sql),
                schema: status.read,
                bootPassed: Effect.succeed(false),
              }).pipe(Layer.provide(Layer.succeed(MaintenanceState, state))),
            ).pipe(
              Effect.map((built) => Context.get(built, MaintenanceTriggers)),
            );

            // Several passes over every reading the gate takes, past the
            // one-second cache each sits behind.
            for (let pass = 0; pass < 3; pass += 1) {
              yield* triggers.closure;
              yield* Effect.sleep('1100 millis');
            }

            const result = yield* readiness({
              db: databaseCheck(sql),
              schema: schemaCheck(status.read),
              maintenance: maintenanceCheck(triggers),
            });
            assert.strictEqual(result.status, 'failing');
            assert.deepStrictEqual(result.checks, {
              db: 'failed: the database has not been set up for Studio yet',
              schema: 'failed: the database has not been set up for Studio yet',
              maintenance: 'failed: the server is starting',
            });
            assert.notInclude(JSON.stringify(result), TENANT_ROLES.app);

            const warnings = logs.lines.filter((line) => line.level === 'Warn');
            assert.strictEqual(
              warnings.length,
              1,
              `expected the one waiting warning, got:\n${warnings.map((line) => line.text.slice(0, 120)).join('\n')}`,
            );
            assert.include(
              warnings[0]?.text,
              'Waiting for it, with no restart needed',
            );
            assert.isAbove(logs.lines.length, 0);
            for (const line of logs.lines) {
              assert.notMatch(line.text, STACK_FRAME, line.text.slice(0, 120));
            }
          }).pipe(
            Effect.provide(logs.layer),
            Effect.provideService(References.MinimumLogLevel, 'Info'),
          ),
        );
      },
      { timeout: 60_000 },
    );

    it.live(
      'measures the job clock once at boot, not twice',
      () => {
        const logs = capture();
        return Effect.scoped(
          Effect.gen(function* () {
            if (!testDb)
              throw new Error('unreachable: probe guaranteed a database');
            yield* Layer.build(
              JobClock.layerApplication({
                clockMonitorInterval: '1 hour',
              }).pipe(Layer.provide(rolelessDatabase(testDb.url))),
            );
            yield* Effect.sleep('500 millis');

            // At debug, because that is where a missing role is logged: the case
            // is counting attempts, and the attempts are the lines.
            const attempts = logs.lines.filter((line) =>
              line.text.includes('the job clock could not be measured'),
            );
            assert.strictEqual(attempts.length, 1);
          }).pipe(
            Effect.provide(logs.layer),
            Effect.provideService(References.MinimumLogLevel, 'Debug'),
          ),
        );
      },
      { timeout: 30_000 },
    );
  },
);

describe('a reading the gate takes that fails for any other reason', () => {
  it.live(
    'logs one warning for the failure, with the reason in it and no stack',
    () => {
      const logs = capture();
      return Effect.gen(function* () {
        const reading = yield* cachedReading({
          name: 'the thing',
          read: Effect.fail(new Error('connect ECONNREFUSED 127.0.0.1:1')),
          initial: false,
        });
        for (let pass = 0; pass < 3; pass += 1) yield* reading;

        const warnings = logs.lines.filter((line) => line.level === 'Warn');
        assert.strictEqual(warnings.length, 1);
        assert.include(warnings[0]?.text, 'could not read the thing');
        assert.include(warnings[0]?.text, 'connect ECONNREFUSED 127.0.0.1:1');
        for (const line of logs.lines) {
          assert.notMatch(line.text, STACK_FRAME, line.text.slice(0, 120));
        }
      }).pipe(Effect.provide(logs.layer));
    },
  );
});
