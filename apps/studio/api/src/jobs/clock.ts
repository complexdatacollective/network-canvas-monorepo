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

export type JobClockShape = {
  readonly now: Effect.Effect<DateTime.Utc>;
};

const JobClockKey = Context.Reference<JobClockShape>('@studio/jobs/JobClock', {
  defaultValue: (): JobClockShape => ({ now: DateTime.now }),
});

type JobClockConfig = {
  readonly clockMonitorInterval?: Duration.Input | undefined;
};

const CLOCK_MONITOR_INTERVAL = Duration.minutes(10);

const SKEW_WARNING_THRESHOLD = Duration.seconds(60);

export function skewMillis(measurement: {
  readonly before: number;
  readonly after: number;
  readonly database: number;
}): number {
  return measurement.database - (measurement.before + measurement.after) / 2;
}

export function skewWarning(skew: number): string | null {
  if (Math.abs(skew) < Duration.toMillis(SKEW_WARNING_THRESHOLD)) return null;
  return `the job clock is ${(Math.abs(skew) / 1000).toFixed(1)}s ${
    skew > 0 ? 'behind' : 'ahead of'
  } the database; job timestamps are being corrected by that much`;
}

/** In a transaction, `now()` is the transaction's start time, as a job's own statements see it. */
const DATABASE_NOW = Effect.flatMap(
  Transaction,
  ({ sql }) => sql<{ at: Date }>`SELECT now() AS at`,
);

const measureSkew = Effect.fnUntraced(function* <R>(
  onScope: (
    read: typeof DATABASE_NOW,
  ) => Effect.Effect<ReadonlyArray<{ at: Date }>, unknown, R>,
) {
  const before = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
  const rows = yield* onScope(DATABASE_NOW);
  const after = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
  const databaseMillis = rows[0]?.at.getTime();
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
  ) => Effect.Effect<ReadonlyArray<{ at: Date }>, unknown, R>,
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
        Effect.catchCause((cause) =>
          Effect.logWarning(
            'the job clock could not be measured against the database; keeping the last correction',
            cause,
          ),
        ),
      );

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

const layerTest: Layer.Layer<never> = Layer.succeed(JobClockKey)({
  now: DateTime.now,
});

const layerOffset = (offset: Duration.Input): Layer.Layer<never> =>
  Layer.succeed(JobClockKey)({
    now: Effect.map(DateTime.now, (instant) =>
      DateTime.addDuration(instant, offset),
    ),
  });

const layer = (
  config: JobClockConfig = {},
): Layer.Layer<never, never, MaintenanceDatabase> =>
  makeLayer(config, (read) => MaintenanceScope.open(read));

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
