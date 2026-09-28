import { Console, Effect, Layer, Schema } from 'effect';

import { MaintenanceDatabase } from '../db/client.ts';
import {
  type DeploymentState,
  type MaintenanceWindow,
  setMaintenance,
} from '../db/deployment-state.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import { LoggerLive } from '../platform/logger.ts';
import { TracingLive } from '../platform/tracing.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

// The image's fifth entry: `studio-api maintenance on [reason…]` and
// `studio-api maintenance off` (#1901). It flips `deployment_state`'s flag and
// exits; the web process's gate and the worker's pause read the flag within a
// second of each other (`platform/maintenance-state.ts`). It is the only way to
// set it: there is no procedure and no token for it, and the deploy script
// (#1910) runs this same command over its forced-command key.
//
// The write runs as the maintenance role, the only one granted `UPDATE` on the
// row (`db/deployment-state.ts`). The role is pinned by this command's own
// client rather than by whichever service runs it, which is why
// `docker compose run --rm --no-deps api maintenance on` is correct even though
// the `api` service serves as the application role.
//
// A one-shot `Effect` like `migrate`: `NodeRuntime.runMain`'s teardown turns
// the outcome into the exit code — 0 once the row says what was asked, 1 for a
// refusal or a failed write, 130 for a signal — and a refusal is printed as the
// one sentence an operator acts on (`programs/command.ts`). The deploy script
// branches on exactly those three (#1910).

const USAGE = 'Usage: studio-api maintenance on [reason…] | off';

/** A refusal before anything is touched: a message for whoever typed the command. */
class MaintenanceRefused extends Schema.TaggedError<MaintenanceRefused>()(
  'MaintenanceRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

/** A write that did not complete, reported by its own message. */
class MaintenanceFailed extends Schema.TaggedError<MaintenanceFailed>()(
  'MaintenanceFailed',
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

/**
 * The reason as `deployment_state_reason_check` will take it: 1 to 280
 * characters, not all whitespace. Refused here, with a sentence, rather than
 * by the database as a bare `23514`. JavaScript counts UTF-16 units where
 * Postgres counts characters and `\S` knows more whitespace than
 * `[:space:]`, so this refuses a little more than the constraint does and
 * never less.
 */
const MaintenanceReason = Schema.String.check(
  Schema.isLengthBetween(1, 280),
  Schema.isPattern(/\S/),
);

/** What the arguments ask for: `on` with an optional reason, or `off`. */
export const parseMaintenanceArguments = Effect.fnUntraced(function* (
  args: ReadonlyArray<string>,
): Effect.fn.Return<MaintenanceWindow, MaintenanceRefused> {
  const [command, ...words] = args;
  if (command === 'off' && words.length === 0) {
    return { maintenance: false };
  }
  if (command !== 'on') {
    return yield* new MaintenanceRefused({ reason: USAGE });
  }
  if (words.length === 0) return { maintenance: true, reason: null };
  const reason = yield* Schema.decodeUnknownEffect(MaintenanceReason)(
    words.join(' '),
  ).pipe(
    Effect.mapError(
      () =>
        new MaintenanceRefused({
          reason:
            'The maintenance reason must be 1 to 280 characters and not only whitespace.',
        }),
    ),
  );
  return { maintenance: true, reason };
});

/** The row as it now stands, as the operator reads it. */
const describeState = (state: DeploymentState): string =>
  state.maintenance
    ? state.reason === null
      ? 'Maintenance mode is on.'
      : `Maintenance mode is on: ${state.reason}`
    : 'Maintenance mode is off.';

/**
 * Writes the window on the maintenance client and prints the row as written.
 * Separate from the program so a suite can run it against its own scratch
 * schema, and against the application client to show that role is refused.
 */
export const applyMaintenanceWindow = Effect.fn('maintenance.apply')(function* (
  window: MaintenanceWindow,
) {
  const state = yield* MaintenanceScope.open(setMaintenance(window)).pipe(
    Effect.catch((cause) => new MaintenanceFailed({ cause })),
  );
  yield* Console.log(describeState(state));
  return state;
});

const maintenance = Effect.fnUntraced(function* (args: ReadonlyArray<string>) {
  const window = yield* parseMaintenanceArguments(args);
  const { db } = yield* Environment;
  if (!db) {
    return yield* new MaintenanceRefused({
      reason:
        'DATABASE_URL is required for maintenance: there is no deployment to open or close.',
    });
  }

  yield* Console.log(`Network Canvas Studio maintenance ${STUDIO_VERSION}`);

  // Built for this command and released with it, like rotation's.
  const Maintenance = MaintenanceDatabase.layer({
    url: db.url,
    applicationName: 'studio-maintenance',
  });
  return yield* applyMaintenanceWindow(window).pipe(
    Effect.provide(Maintenance),
    Effect.catchTag('SqlError', (cause) => new MaintenanceFailed({ cause })),
  );
});

/** The command over its arguments, with the environment decoded once at its root. */
export const MaintenanceProgram = (args: ReadonlyArray<string>) =>
  maintenance(args).pipe(
    reportingRefusals,
    Effect.provide(
      Layer.mergeAll(LoggerLive, TracingLive('maintenance')).pipe(
        Layer.provideMerge(Environment.layer),
      ),
    ),
  );
