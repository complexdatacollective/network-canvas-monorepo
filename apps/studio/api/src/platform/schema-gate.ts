import { Context, Effect, Latch, Layer, Schedule, Schema } from 'effect';

import { ReadinessDatabase } from '../db/client.ts';
import { isMissingRole } from '../db/errors.ts';
import {
  checkSchemaEffect,
  type SchemaProblem,
  type SchemaState,
  schemaProblemMessage,
} from '../db/schema.ts';
import { Environment } from '../env.ts';

const RETRY_INTERVAL = '3 seconds';

const DEPLOYED_WAIT =
  'Waiting for it, with no restart needed: the API answers every request with the maintenance page and the worker runs no jobs until the schema is current. Checked every 3 seconds.';

/**
 * Both lanes wait for an absent or stale schema rather than refuse it (#1901):
 * an upgrade starts the new image before `migrate` runs, and the processes it
 * started have to be there, closed, when the schema arrives. Only the words
 * differ by lane, because only the remedies do.
 */
const waitingMessage = (state: SchemaProblem, devDefaults: boolean): string => {
  if (!devDefaults) {
    return `${schemaProblemMessage(state, 'deployed')}\n${DEPLOYED_WAIT}`;
  }
  return state.kind === 'absent'
    ? 'Database has no Studio schema; sign-in will fail until it is created: pnpm --filter @codaco/studio-api db:reset'
    : 'Database schema is not from this build; waiting for the development reset (pnpm dev runs it on boot; otherwise: pnpm --filter @codaco/studio-api db:reset)';
};

export class SchemaUnreachable extends Schema.TaggedError<SchemaUnreachable>()(
  'SchemaUnreachable',
  { cause: Schema.Defect() },
) {
  override get message(): string {
    const { cause } = this;
    return `Could not read the schema fingerprint: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

export class SchemaStatus extends Context.Service<
  SchemaStatus,
  {
    readonly read: Effect.Effect<SchemaState, SchemaUnreachable>;
    /** Completes once the schema is this build's, and never before. */
    readonly current: Effect.Effect<void>;
  }
>()('@studio/SchemaStatus') {
  static readonly layer: Layer.Layer<
    SchemaStatus,
    SchemaUnreachable,
    Environment | ReadinessDatabase
  > = Layer.effect(
    SchemaStatus,
    Effect.gen(function* () {
      const env = yield* Environment;
      const { sql } = yield* ReadinessDatabase;

      const currentLatch = yield* Latch.make(false);

      const read: Effect.Effect<SchemaState, SchemaUnreachable> =
        checkSchemaEffect(sql).pipe(
          Effect.mapError((cause) => new SchemaUnreachable({ cause })),
        );

      const status = SchemaStatus.of({ read, current: currentLatch.await });

      // One attempt at a time: an attempt against an unreachable host can
      // outlive its tick, and stacking them would exhaust the pool.
      const waitUntilCurrent = read.pipe(
        Effect.catch(() => Effect.succeed<SchemaState>({ kind: 'absent' })),
        Effect.map((state) => state.kind === 'current'),
        Effect.repeat({
          schedule: Schedule.spaced(RETRY_INTERVAL),
          until: (isCurrent: boolean) => isCurrent,
        }),
        Effect.andThen(currentLatch.open),
        Effect.andThen(Effect.logInfo('Database schema current.')),
        Effect.forkScoped,
      );

      const waitForSchema = Effect.fnUntraced(function* (state: SchemaProblem) {
        yield* Effect.logWarning(waitingMessage(state, env.devDefaults));
        yield* waitUntilCurrent;
      });

      const verdict = yield* Effect.result(read);

      if (verdict._tag === 'Failure') {
        const failure = verdict.failure;
        // The client runs as a role the schema apply creates, so a
        // never-applied database refuses the connection.
        if (isMissingRole(failure.cause)) {
          yield* waitForSchema({ kind: 'absent' });
          return status;
        }
        // A database that does not answer is not something `migrate` fixes,
        // so a deployment refuses it and leaves the retry to the container
        // runtime; the development lane waits for `pnpm dev` to start it.
        if (!env.devDefaults) return yield* failure;
        yield* Effect.logWarning(
          `Database unreachable; sign-in will fail until it is available: ${String(failure.cause)}`,
        );
        yield* waitUntilCurrent;
        return status;
      }

      const state = verdict.success;
      if (state.kind === 'current') {
        yield* currentLatch.open;
        return status;
      }

      yield* waitForSchema(state);
      return status;
    }),
  );

  static readonly layerCurrent: Layer.Layer<SchemaStatus> = Layer.succeed(
    SchemaStatus,
    SchemaStatus.of({
      read: Effect.succeed<SchemaState>({ kind: 'current' }),
      current: Effect.void,
    }),
  );
}
