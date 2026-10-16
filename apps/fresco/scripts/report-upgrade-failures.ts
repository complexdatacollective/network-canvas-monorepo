import { PostHog } from 'posthog-node';

import {
  getProtocolFileErrorKind,
  type ProtocolFileErrorKind,
} from '@codaco/protocol-validation';
import {
  buildAppSuperProperties,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@codaco/shared-consts';

import pkg from '../package.json';
import { type ProtocolUpgradeFailure } from './migrate-protocols';

// The startup scripts run from an image that carries `scripts/`, `lib/db` and
// `env.js` but not the rest of the app, so this cannot import
// `lib/posthog-server` or `fresco.config`. These are the same properties
// `fresco.config`'s POSTHOG_APP_PROPERTIES builds.
const APP_PROPERTIES = buildAppSuperProperties({
  appKey: 'Fresco',
  appName: 'Fresco',
  version: pkg.version,
});

/** What this module reads from the setup script's own database client. */
type SettingsReader = {
  appSettings: {
    findUnique: (args: {
      where: { key: 'disableAnalytics' | 'installationId' };
    }) => Promise<{ value: string } | null>;
  };
};

type Reportable = {
  /** The classified kind, from the vocabulary imports report. */
  reason: ProtocolFileErrorKind;
  /** The error to send: never the wrapper, whose message names the protocol. */
  error: unknown;
};

/**
 * The migration error behind a failed upgrade, and its kind.
 *
 * The deploy script wraps what it caught in an error naming the protocol and
 * its id, which must not leave the deployment, so the first error in the
 * `cause` chain that the package can classify is what gets reported. Anything
 * the package cannot classify still failed the upgrade, so it is reported as
 * `upgradeFailed` with the deepest cause in the chain.
 */
export function describeUpgradeFailure(error: unknown): Reportable {
  let current: unknown = error;
  let deepest: unknown = error;
  while (current instanceof Error) {
    const kind = getProtocolFileErrorKind(current);
    if (kind !== null) return { reason: kind, error: current };
    deepest = current;
    current = current.cause;
  }
  return { reason: 'upgradeFailed', error: deepest };
}

/**
 * Reports each stored protocol the deploy migration left behind, both as a
 * refused protocol (`ProtocolUpgradeFailed`, carrying only the kind and the
 * schema versions) and as an application error, so failed upgrades can be
 * counted and their causes found. Every one is reported as an error, whatever
 * its kind: the deployment accepted this protocol once, so failing to upgrade
 * it is a defect in the upgrade, not a fault in a file the researcher chose.
 *
 * Runs in the setup script, outside Next, so it reads the analytics setting
 * from the script's own client rather than through the cached query helpers,
 * and sends nothing when analytics are disabled or the setting cannot be read.
 * Never throws: telemetry must not stop a deployment from starting.
 */
export async function reportProtocolUpgradeFailures(
  failures: ProtocolUpgradeFailure[],
  prisma: SettingsReader,
): Promise<void> {
  if (failures.length === 0) return;

  try {
    const { env } = await import('~/env');
    if (env.DISABLE_ANALYTICS) return;

    const disabled = await prisma.appSettings.findUnique({
      where: { key: 'disableAnalytics' },
    });
    if (disabled?.value === 'true') return;

    const distinctId =
      env.INSTALLATION_ID ??
      (
        await prisma.appSettings.findUnique({
          where: { key: 'installationId' },
        })
      )?.value ??
      'unknown';

    const posthog = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
    const common = {
      ...APP_PROPERTIES,
      installation_id: distinctId,
      $source: 'server',
    };

    for (const failure of failures) {
      const { reason, error } = describeUpgradeFailure(failure.error);
      const properties = {
        reason,
        from_schema_version: failure.fromSchemaVersion,
        to_schema_version: failure.toSchemaVersion,
      };
      posthog.capture({
        distinctId,
        event: 'ProtocolUpgradeFailed',
        properties: { ...properties, ...common },
      });
      posthog.captureException(error, distinctId, {
        ...properties,
        ...common,
        context: 'protocol.upgrade',
      });
    }

    // The setup script exits as soon as it is done, so wait for delivery.
    await posthog.shutdown();
  } catch {
    // swallow
  }
}
