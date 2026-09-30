import {
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  MutableRef,
  Schedule,
} from 'effect';

import { type Database, type MaintenanceDatabase } from '../db/client.ts';
import {
  MaintenanceScope,
  Transaction,
  UntenantedScope,
} from '../db/tenant.ts';

// The clock every job timestamp is taken from.
//
// This queue asks the *application* clock for the time and passes the answer to
// Postgres as a parameter, where pg-boss asks the database (`now()` is in every
// one of its plans). An app clock is what makes the whole queue `TestClock`-
// drivable against a real Postgres — but it is also skew-sensitive in a way
// pg-boss is not: a replica whose clock runs five minutes fast would enqueue
// jobs five minutes in the future, and an unskewed worker would leave them
// sitting there.
//
// pg-boss answers that with `Timekeeper.cacheClockSkew` (12.31.1
// `dist/timekeeper.js:229-248`): read the database's clock, subtract the local
// one, cache the difference, add it to `Date.now()` wherever a schedule is
// evaluated, and re-measure every `clockMonitorIntervalSeconds` (default 600).
// `JobClock.layer` is that, with the same interval and the same 60-second
// warning threshold — pg-boss warns at `skewSeconds >= 60`, not at one second.

/** The one thing the queue asks of a clock. */
export type JobClockShape = {
  readonly now: Effect.Effect<DateTime.Utc>;
};

/**
 * A `Context.Reference` rather than a `Context.Service`, because the default is
 * a real answer rather than a missing one: the uncorrected Effect `Clock` is
 * what every suite wants and what a single-replica deployment can live with, so
 * requiring it everywhere would put a service in the requirements of code whose
 * behaviour does not depend on which implementation it gets. Production
 * overrides it with `JobClock.layer`; a suite that wants an explicit clock
 * provides `JobClock.layerTest`.
 *
 * Reading it costs nothing at the type level, which is what keeps
 * `Jobs.enqueue`'s requirement exactly `Transaction`.
 */
const JobClockKey = Context.Reference<JobClockShape>('@studio/jobs/JobClock', {
  defaultValue: (): JobClockShape => ({ now: DateTime.now }),
});

type JobClockConfig = {
  /** pg-boss's `clockMonitorIntervalSeconds`, whose default is ten minutes. */
  readonly clockMonitorInterval?: Duration.Input | undefined;
};

/** pg-boss's own default (`attorney.js:609`). */
const CLOCK_MONITOR_INTERVAL = Duration.minutes(10);

/**
 * pg-boss's own threshold (`timekeeper.js:243`): it warns once the absolute
 * skew reaches a minute, and corrects for any amount below that silently.
 */
const SKEW_WARNING_THRESHOLD = Duration.seconds(60);

/**
 * The arithmetic of one measurement, on its own so both of its signs have an
 * oracle without a database: positive when the database is ahead of this
 * process (the local clock is *behind* and every timestamp needs adding to),
 * negative when it is behind (the local clock is *ahead* and every timestamp
 * needs subtracting from). Neither direction is clamped — a replica whose
 * clock runs fast is exactly as real as one that runs slow, and clamping
 * either would leave that replica enqueueing into the future or the past with
 * nothing to correct it.
 *
 * Measured against the midpoint of the round trip rather than against either
 * end, so a slow query reads as latency rather than as skew. pg-boss measures
 * after the query and so folds the whole round trip into the number; Studio's
 * own pools sit beside the database, but the midpoint costs nothing and makes
 * a loaded database stop looking like a broken clock.
 */
export function skewMillis(measurement: {
  /** The local clock immediately before the round trip. */
  readonly before: number;
  /** The local clock immediately after it. */
  readonly after: number;
  /** What the database answered `select now()` with. */
  readonly database: number;
}): number {
  return measurement.database - (measurement.before + measurement.after) / 2;
}

/**
 * What a measured skew is worth saying out loud, or `null` below pg-boss's
 * threshold. Separate from the logging so the boundary — a minute warns, a
 * millisecond under it does not — is a value a test can read.
 */
export function skewWarning(skew: number): string | null {
  if (Math.abs(skew) < Duration.toMillis(SKEW_WARNING_THRESHOLD)) return null;
  return `the job clock is ${(Math.abs(skew) / 1000).toFixed(1)}s ${
    skew > 0 ? 'behind' : 'ahead of'
  } the database; job timestamps are being corrected by that much`;
}

/**
 * One measurement of `select now()` against the local clock, in milliseconds:
 * positive when the database is ahead of this process.
 *
 * Read inside a transaction because that is the only place the identity's
 * role is pinned, and `now()` inside a transaction is the transaction's start
 * time — which is what pg-boss's `getTime()` plan reads too, and is the same
 * instant every statement of a job's own transaction will see.
 */
const DATABASE_NOW = Effect.flatMap(
  Transaction,
  ({ sql }) => sql<{ at: number }>`SELECT now() AS at`,
);

const measureSkew = Effect.fnUntraced(function* <R>(
  onScope: (
    read: typeof DATABASE_NOW,
  ) => Effect.Effect<ReadonlyArray<{ at: number }>, unknown, R>,
) {
  const before = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
  const rows = yield* onScope(DATABASE_NOW);
  const after = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
  const databaseMillis = rows[0]?.at;
  if (databaseMillis === undefined) {
    return yield* Effect.fail(
      new Error('the database answered `select now()` with no row'),
    );
  }
  return skewMillis({ before, after, database: databaseMillis });
});

const makeLayer = <R>(
  config: JobClockConfig,
  onScope: (
    read: typeof DATABASE_NOW,
  ) => Effect.Effect<ReadonlyArray<{ at: number }>, unknown, R>,
): Layer.Layer<never, never, R> =>
  Layer.effect(
    JobClockKey,
    Effect.gen(function* () {
      const skew = MutableRef.make(0);

      const remeasure = Effect.gen(function* () {
        const measured = yield* measureSkew(onScope);
        MutableRef.set(skew, measured);
        const warning = skewWarning(measured);
        if (warning !== null) yield* Effect.logWarning(warning);
      }).pipe(
        // A failed measurement keeps the last correction rather than resetting
        // it to zero: a database that cannot be reached says nothing about what
        // the skew was, and reverting to an uncorrected clock mid-flight would
        // move every timestamp the queue writes.
        Effect.catchCause((cause) =>
          Effect.logWarning(
            'the job clock could not be measured against the database; keeping the last correction',
            cause,
          ),
        ),
      );

      // At build, so nothing is enqueued on an unmeasured clock.
      yield* remeasure;
      yield* Effect.forkScoped(
        Effect.repeat(
          remeasure,
          Schedule.spaced(
            config.clockMonitorInterval ?? CLOCK_MONITOR_INTERVAL,
          ),
        ),
      );

      return {
        now: Effect.map(DateTime.now, (instant) =>
          DateTime.addDuration(instant, Duration.millis(MutableRef.get(skew))),
        ),
      };
    }),
  );

/** The Effect `Clock` alone, uncorrected — which `TestClock` drives. */
const layerTest: Layer.Layer<never> = Layer.succeed(JobClockKey)({
  now: DateTime.now,
});

/**
 * A clock a fixed offset away from the Effect `Clock`, for a suite that wants
 * to *be* the skewed replica rather than to correct one. Not a production
 * layer: nothing measures, so the offset never converges.
 */
const layerOffset = (offset: Duration.Input): Layer.Layer<never> =>
  Layer.succeed(JobClockKey)({
    now: Effect.map(DateTime.now, (instant) =>
      DateTime.addDuration(instant, offset),
    ),
  });

/**
 * The worker's, on the maintenance client: the identity its own jobs run as.
 */
const layer = (
  config: JobClockConfig = {},
): Layer.Layer<never, never, MaintenanceDatabase> =>
  makeLayer(config, (read) => MaintenanceScope.open(read));

/**
 * The web process's, on the application client.
 *
 * It exists because the node-postgres enqueue this replaced asked the database
 * for `now()` in the insert itself, so the web process never needed a clock at
 * all. `Jobs.enqueue` passes an instant as a parameter, which is what makes
 * the whole queue `TestClock`-drivable — and which would otherwise leave a
 * replica with a fast clock enqueueing jobs into the future for an unskewed
 * worker to ignore. Same measurement, same interval, same threshold; only the
 * scope differs, because a request-serving process holds no maintenance
 * client.
 */
const layerApplication = (
  config: JobClockConfig = {},
): Layer.Layer<never, never, Database> =>
  makeLayer(config, (read) => UntenantedScope.open(read));

export const JobClock = Object.assign(JobClockKey, {
  layer,
  layerApplication,
  layerTest,
  layerOffset,
});
