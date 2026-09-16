import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Fiber, Layer } from 'effect';
import { afterAll, beforeAll } from 'vitest';

import { applySchema } from '../../../scripts/apply.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { DatabasePool } from '../../db/database-pool.ts';
import { type DbEnv, Environment, readEnv } from '../../env.ts';
import { SchemaStatus, StaleSchema } from '../schema-gate.ts';
import { collectLogs } from './support/logs.ts';

// The gate's whole subject is a real database's fingerprint, so every case
// that has one runs against a scratch database of its own (`it.live`): an
// empty one is the `absent` verdict, and applying the schema underneath a
// running gate is the development lane's reset.

/** drizzle-kit push against a fresh database, and it shares the CI runner. */
const APPLY_TIMEOUT_MS = 180_000;

/** A boot, a push, and the three-second retry that follows it. */
const RESET_CASE_TIMEOUT_MS = 240_000;

/** Generous next to the retry cadence, so a hang fails with these words. */
const BECOMES_CURRENT_TIMEOUT = '60 seconds';

const ABSENT_WARNING =
  'Database has no Studio schema; sign-in will fail until it is created: pnpm --filter @codaco/studio-server db:reset';

const db = await reachableDb();

/**
 * The gate as a program wires it: the application pool over this database, and
 * an environment that is the development lane's except for the one flag the
 * case is about.
 */
const gate = (scratch: DbEnv, devDefaults: boolean) =>
  SchemaStatus.layer.pipe(
    Layer.provide(DatabasePool.layerApplication(scratch)),
    Layer.provide(
      Layer.succeed(Environment, { ...readEnv(), db: scratch, devDefaults }),
    ),
  );

describe.skipIf(!db)('SchemaStatus.layer', () => {
  let applied: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    applied = await createScratchDatabase(db);
    await applySchema(applied.pool);
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await applied.dispose();
  });

  // Mutation: make the deployment branch log the problem instead of failing
  // with it → the layer builds and this case has nothing to catch.
  it.live('refuses a database with no Studio schema outside development', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const empty = yield* Effect.promise(() => createScratchDatabase(db));
      try {
        const outcome = yield* Effect.result(
          Effect.scoped(Layer.build(gate(empty.db, false))),
        );

        expect(outcome._tag).toBe('Failure');
        if (outcome._tag !== 'Failure') return;
        expect(outcome.failure).toBeInstanceOf(StaleSchema);
        // What `runMain`'s reporter prints on stderr, and what the worker
        // entrypoint suite matches: the verdict first, the remedies after it.
        expect(outcome.failure.message).toMatch(
          /^The database has no Studio schema\.\n/,
        );
      } finally {
        yield* Effect.promise(empty.dispose);
      }
    }),
  );

  // Mutation: fail rather than warn when `devDefaults` is set → the layer
  // never builds and `pnpm dev` could not start a server before its reset.
  // Mutation: drop the `currentLatch.open` from the retry → `current` never
  // completes and the wait below times out.
  it.live(
    'comes up waiting in development and completes once the schema arrives',
    () =>
      Effect.gen(function* () {
        if (!db) throw new Error('unreachable: probe guaranteed a database');
        const scratch = yield* Effect.promise(() => createScratchDatabase(db));
        const logs = collectLogs();
        try {
          yield* Effect.scoped(
            Effect.gen(function* () {
              const context = yield* Layer.build(gate(scratch.db, true));
              const status = Context.get(context, SchemaStatus);

              // Built, but not current: the development lane comes up and
              // waits, so the process is already running when the reset ends.
              const waiting = yield* Effect.forkChild(status.current);
              expect(
                yield* Effect.sync(() => waiting.pollUnsafe()),
              ).toBeUndefined();
              expect(logs.messages).toContain(ABSENT_WARNING);

              yield* Effect.promise(() => applySchema(scratch.pool));

              yield* Effect.timeoutOrElse(Fiber.join(waiting), {
                duration: BECOMES_CURRENT_TIMEOUT,
                orElse: () =>
                  Effect.die(
                    new Error(
                      'the schema gate never saw the applied schema become current',
                    ),
                  ),
              });
              expect(logs.messages).toContain('Database schema current.');
            }),
          ).pipe(Effect.provide(logs.layer));
        } finally {
          yield* Effect.promise(scratch.dispose);
        }
      }),
    RESET_CASE_TIMEOUT_MS,
  );

  // Mutation: answer a cached verdict from the build instead of re-reading →
  // the empty database would report `current` like the applied one.
  it.live('reads a fresh verdict for readiness', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const empty = yield* Effect.promise(() => createScratchDatabase(db));
      try {
        const current = yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(gate(applied.db, false));
            return yield* Context.get(context, SchemaStatus).read;
          }),
        );
        expect(current).toEqual({ kind: 'current' });

        const absent = yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(gate(empty.db, true));
            return yield* Context.get(context, SchemaStatus).read;
          }),
        );
        expect(absent.kind).not.toBe('current');
      } finally {
        yield* Effect.promise(empty.dispose);
      }
    }),
  );
});

describe('SchemaStatus.layerCurrent', () => {
  // Under the TestClock nothing that waited could ever complete, so this
  // passing is the assertion. Mutation: give `current` a latch nobody opens →
  // the case hangs to its timeout.
  it.effect('is already current, and never waits', () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(SchemaStatus.layerCurrent);
      const status = Context.get(context, SchemaStatus);

      yield* status.current;
      expect(yield* status.read).toEqual({ kind: 'current' });
    }),
  );
});
