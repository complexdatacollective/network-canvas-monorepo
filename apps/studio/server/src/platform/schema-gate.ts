import { Context, Effect, Latch, Layer, Schedule, Schema } from 'effect';

import { DatabasePool } from '../db/database-pool.ts';
import { isMissingRoleError } from '../db/pool.ts';
import {
  checkSchema,
  type SchemaProblem,
  type SchemaState,
  schemaProblemMessage,
} from '../db/schema.ts';
import { Environment } from '../env.ts';

// What both entrypoints do before they do their own work: refuse to run
// against a database this build did not create. The web process and the
// worker verify the same fingerprint the same way (#1895) — a worker that
// tolerated a stale schema would run handlers against tables the build no
// longer describes, which is exactly the failure the web process refuses.
//
// The layer builds as soon as the verdict is known, not when the schema is
// current: the development lane comes up and waits, so the process is already
// running when `pnpm dev`'s reset finishes. `current` is what a consumer waits
// on when it may only talk to the database afterwards (the job worker), and
// `read` is a fresh verdict for `/readyz`.

/** The development lane re-reads the fingerprint on this cadence. */
const RETRY_INTERVAL = '3 seconds';

export class StaleSchema extends Schema.TaggedError<StaleSchema>()(
  'StaleSchema',
  {
    kind: Schema.Literals(['absent', 'stale']),
    reason: Schema.String,
    remedy: Schema.String,
  },
) {
  /**
   * The deployed remedies: this is read in a container log, where the
   * checkout's pnpm scripts and drizzle-kit do not exist. Split into the
   * verdict and what to do about it so a reader — and a test — can match the
   * first line alone.
   */
  static fromState(state: SchemaProblem): StaleSchema {
    const [reason = '', ...remedy] = schemaProblemMessage(
      state,
      'deployed',
    ).split('\n');
    return new StaleSchema({
      kind: state.kind,
      reason,
      remedy: remedy.join('\n'),
    });
  }

  override get message(): string {
    return `${this.reason}\n${this.remedy}`;
  }
}

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
    /** A fresh verdict, for `/readyz`. */
    readonly read: Effect.Effect<SchemaState, SchemaUnreachable>;
    /** Completes once the schema has been seen current. */
    readonly current: Effect.Effect<void>;
  }
>()('@studio/SchemaStatus') {
  static readonly layer: Layer.Layer<
    SchemaStatus,
    StaleSchema | SchemaUnreachable,
    Environment | DatabasePool
  > = Layer.effect(
    SchemaStatus,
    Effect.gen(function* () {
      const env = yield* Environment;
      const { pool } = yield* DatabasePool;

      // Closed until a verdict of `current` has been seen, so a consumer that
      // may only talk to the database afterwards suspends rather than polls.
      const currentLatch = yield* Latch.make(false);

      // A problem is returned rather than thrown by `checkSchema`, so anything
      // in the error channel here is a connection failure rather than an
      // answer about the schema.
      const read: Effect.Effect<SchemaState, SchemaUnreachable> =
        Effect.tryPromise({
          try: () => checkSchema(pool),
          catch: (cause) => new SchemaUnreachable({ cause }),
        });

      const status = SchemaStatus.of({ read, current: currentLatch.await });

      // One attempt at a time is a property of running in one fiber: an
      // attempt against an unreachable host can outlive its tick, and stacking
      // them would exhaust the pool. A check that throws mid-retry is an
      // unreachable database, which is the state being waited out.
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

      // Everything below the deployment's refusal is the development lane by
      // construction: outside it the layer has already failed, so the pnpm
      // remedies these name are remedies the reader can run.
      const waitForSchema = Effect.fnUntraced(function* (state: SchemaProblem) {
        yield* Effect.logWarning(
          state.kind === 'absent'
            ? 'Database has no Studio schema; sign-in will fail until it is created: pnpm --filter @codaco/studio-server db:reset'
            : 'Database schema is not from this build; waiting for the development reset (pnpm dev runs it on boot; otherwise: pnpm --filter @codaco/studio-server db:reset)',
        );
        yield* waitUntilCurrent;
      });

      const verdict = yield* Effect.result(read);

      if (verdict._tag === 'Failure') {
        const failure = verdict.failure;
        // The pools run as roles the schema apply creates, so a never-applied
        // database refuses the connection before the fingerprint can be read.
        if (isMissingRoleError(failure.cause)) {
          if (!env.devDefaults)
            return yield* StaleSchema.fromState({ kind: 'absent' });
          yield* waitForSchema({ kind: 'absent' });
          return status;
        }
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

      // Outside development a stale or absent schema is a resolved answer, not
      // a transient failure: retrying would re-read the same fingerprint every
      // three seconds. The development lane waits instead, the same way it
      // waits for the container itself — `pnpm dev` finishes its reset before
      // this process starts, but a server started on its own against a
      // database another build applied, or a `db:reset` run beside a running
      // server, should recover by themselves once the schema is current.
      if (!env.devDefaults) return yield* StaleSchema.fromState(state);
      yield* waitForSchema(state);
      return status;
    }),
  );

  /** For suites that provisioned the schema themselves. */
  static readonly layerCurrent: Layer.Layer<SchemaStatus> = Layer.succeed(
    SchemaStatus,
    SchemaStatus.of({
      read: Effect.succeed<SchemaState>({ kind: 'current' }),
      current: Effect.void,
    }),
  );
}
