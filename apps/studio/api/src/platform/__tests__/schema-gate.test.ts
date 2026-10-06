import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Fiber, Layer } from 'effect';
import { afterAll, beforeAll } from 'vitest';

import { applySchema } from '../../../scripts/apply.ts';
import { freePort } from '../../__tests__/support/entrypoint.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { ReadinessDatabase } from '../../db/client.ts';
import { schemaProblemMessage } from '../../db/schema.ts';
import { type DbEnv, Environment, readEnv } from '../../env.ts';
import { SchemaStatus, SchemaUnreachable } from '../schema-gate.ts';
import { collectLogs } from './support/logs.ts';

const APPLY_TIMEOUT_MS = 180_000;

const RESET_CASE_TIMEOUT_MS = 240_000;

const BECOMES_CURRENT_TIMEOUT = '60 seconds';

const ABSENT_WARNING =
  'Database has no Studio schema; sign-in will fail until it is created: pnpm --filter @codaco/studio-api db:reset';

const db = await reachableDb();

const gate = (scratch: DbEnv, devDefaults: boolean) =>
  SchemaStatus.layer.pipe(
    Layer.provide(
      Layer.orDie(ReadinessDatabase.layer('app', { url: scratch.url })),
    ),
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

  // Neither lane refuses a schema it can wait for (#1901): a deployment starts
  // the new image before `migrate` runs. Only the warning differs, because only
  // the remedy does.
  const comesUpWaiting = (
    devDefaults: boolean,
    warned: (messages: ReadonlyArray<string>) => void,
  ) =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const scratch = yield* Effect.promise(() => createScratchDatabase(db));
      const logs = collectLogs();
      try {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(gate(scratch.db, devDefaults));
            const status = Context.get(context, SchemaStatus);

            const waiting = yield* Effect.forkChild(status.current);
            expect(
              yield* Effect.sync(() => waiting.pollUnsafe()),
            ).toBeUndefined();
            warned(logs.messages);

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
    });

  it.live(
    'comes up waiting outside development, naming migrate, and completes once the schema arrives',
    () =>
      comesUpWaiting(false, (messages) => {
        const remedy = `${schemaProblemMessage({ kind: 'absent' }, 'deployed')}\n`;
        const warning = messages.find((message) =>
          message.startsWith('The database has no Studio schema.'),
        );
        expect(warning?.slice(0, remedy.length)).toBe(remedy);
        expect(warning).toContain('with no restart needed');
      }),
    RESET_CASE_TIMEOUT_MS,
  );

  it.live(
    'comes up waiting in development and completes once the schema arrives',
    () =>
      comesUpWaiting(true, (messages) => {
        expect(messages).toContain(ABSENT_WARNING);
      }),
    RESET_CASE_TIMEOUT_MS,
  );

  it.live(
    'still refuses a database that does not answer, outside development',
    () =>
      Effect.gen(function* () {
        // Not something `migrate` fixes, so the container runtime retries it.
        const unreachable = new URL(applied.db.url);
        unreachable.port = String(yield* Effect.promise(freePort));
        const outcome = yield* Effect.result(
          Effect.scoped(
            Layer.build(gate({ url: unreachable.toString() }, false)),
          ),
        );
        expect(outcome._tag).toBe('Failure');
        if (outcome._tag !== 'Failure') return;
        expect(outcome.failure).toBeInstanceOf(SchemaUnreachable);
      }),
  );

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

  it.live('reads a fresh verdict on every read of one layer', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(gate(applied.db, false));
        const status = Context.get(context, SchemaStatus);
        expect(yield* status.read).toEqual({ kind: 'current' });

        const { rows } = yield* Effect.promise(() =>
          applied.pool.query<{ fingerprint: string }>(
            'select "fingerprint" from "schemaFingerprint"',
          ),
        );
        const stamp = rows[0]?.fingerprint ?? '';
        yield* Effect.acquireRelease(
          Effect.promise(() =>
            applied.pool.query(
              `update "schemaFingerprint" set "fingerprint" = 'another build'`,
            ),
          ),
          () =>
            Effect.promise(() =>
              applied.pool.query(
                'update "schemaFingerprint" set "fingerprint" = $1',
                [stamp],
              ),
            ),
        );

        expect(yield* status.read).toMatchObject({
          kind: 'stale',
          found: 'another build',
        });
      }),
    ),
  );
});

describe('SchemaStatus.layerCurrent', () => {
  // Under the TestClock nothing that waited could ever complete, so this
  // passing is the assertion.
  it.effect('is already current, and never waits', () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(SchemaStatus.layerCurrent);
      const status = Context.get(context, SchemaStatus);

      yield* status.current;
      expect(yield* status.read).toEqual({ kind: 'current' });
    }),
  );
});
