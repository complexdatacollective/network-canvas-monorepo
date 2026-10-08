import { Console, Effect, Layer, Schema } from 'effect';

import { MaintenanceDatabase } from '../db/client.ts';
import {
  type DeploymentState,
  type MaintenanceWindow,
  setMaintenance,
} from '../db/deployment-state.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import { InstallationIdentity } from '../platform/installation-identity.ts';
import { LoggerLive, LogLevelLive } from '../platform/logger.ts';
import { TracingLive } from '../platform/tracing.ts';
import { readInstallationId } from '../setup/bootstrap.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

const USAGE = 'Usage: studio-api maintenance on [reason…] | off';

class MaintenanceRefused extends Schema.TaggedError<MaintenanceRefused>()(
  'MaintenanceRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

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
 * JavaScript counts UTF-16 units where Postgres counts characters, so this
 * refuses a little more than `deployment_state_reason_check` and never less.
 */
const MaintenanceReason = Schema.String.check(
  Schema.isBetweenLength(1, 280),
  Schema.isPattern(/\S/),
);

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

const describeState = (state: DeploymentState): string =>
  state.maintenance
    ? state.reason === null
      ? 'Maintenance mode is on.'
      : `Maintenance mode is on: ${state.reason}`
    : 'Maintenance mode is off.';

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

  const Maintenance = MaintenanceDatabase.layer({
    ...db,
    applicationName: 'studio-maintenance',
  });
  yield* InstallationIdentity.resolveOnce(
    MaintenanceScope.open(readInstallationId()),
  ).pipe(Effect.provide(Maintenance));
  return yield* applyMaintenanceWindow(window).pipe(
    Effect.provide(Maintenance),
    Effect.catchTag('SqlError', (cause) => new MaintenanceFailed({ cause })),
  );
});

export const MaintenanceProgram = (args: ReadonlyArray<string>) =>
  maintenance(args).pipe(
    Effect.provide(
      Layer.mergeAll(LoggerLive, LogLevelLive, TracingLive('maintenance')).pipe(
        Layer.provideMerge(Environment.layer),
      ),
    ),
    // Outside the environment, so a refusal to read it is printed too.
    reportingRefusals,
  );
