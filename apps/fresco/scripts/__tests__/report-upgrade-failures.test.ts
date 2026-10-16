import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateProtocol } from '@codaco/protocol-validation';
import {
  describeUpgradeFailure,
  reportProtocolUpgradeFailures,
} from '~/scripts/report-upgrade-failures';

const { capture, captureException, shutdown, env } = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  shutdown: vi.fn(),
  env: {} as { DISABLE_ANALYTICS?: boolean; INSTALLATION_ID?: string },
}));

vi.mock('posthog-node', () => ({
  PostHog: vi.fn(function PostHog() {
    return { capture, captureException, shutdown };
  }),
}));
vi.mock('~/env', () => ({ env }));

const settings = (values: Record<string, string>) => ({
  appSettings: {
    findUnique: vi.fn(({ where }: { where: { key: string } }) =>
      Promise.resolve(
        where.key in values ? { value: values[where.key] ?? '' } : null,
      ),
    ),
  },
});

/** A real failed upgrade, wrapped the way the deploy script wraps it. */
function storedProtocolFailure() {
  let migrationError: unknown;
  try {
    migrateProtocol({ schemaVersion: 7, stages: 'not-an-array' }, 9);
  } catch (error) {
    migrationError = error;
  }
  return {
    error: new Error(
      'Failed to migrate protocol "Private Study.netcanvas" (id=cm-1): boom',
      { cause: migrationError },
    ),
    fromSchemaVersion: 7,
    toSchemaVersion: 9,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete env.DISABLE_ANALYTICS;
  delete env.INSTALLATION_ID;
});

describe('describeUpgradeFailure', () => {
  it('reports the migration error behind the wrapper, never the wrapper', () => {
    const failure = storedProtocolFailure();
    const { reason, error } = describeUpgradeFailure(failure.error);
    expect(reason).toBe('invalidBeforeUpgrade');
    expect(error).toBe(failure.error.cause);
  });

  it('reports an error it cannot classify by its deepest cause', () => {
    const root = new Error('connection reset');
    const { reason, error } = describeUpgradeFailure(
      new Error('Failed to migrate protocol "Private Study"', { cause: root }),
    );
    expect(reason).toBe('upgradeFailed');
    expect(error).toBe(root);
  });
});

describe('reportProtocolUpgradeFailures', () => {
  it('reports each failure as a refused protocol and as an error', async () => {
    const failure = storedProtocolFailure();
    await reportProtocolUpgradeFailures(
      [failure],
      settings({ installationId: 'install-1' }),
    );

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      distinctId: 'install-1',
      event: 'ProtocolUpgradeFailed',
      properties: expect.objectContaining({
        reason: 'invalidBeforeUpgrade',
        from_schema_version: 7,
        to_schema_version: 9,
        installation_id: 'install-1',
      }),
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      failure.error.cause,
      'install-1',
      expect.objectContaining({ reason: 'invalidBeforeUpgrade' }),
    );
    expect(shutdown).toHaveBeenCalled();
    // Nothing that names the protocol leaves the deployment.
    expect(
      JSON.stringify([capture.mock.calls, captureException.mock.calls]),
    ).not.toMatch(/Private Study|cm-1/);
  });

  it('sends nothing when the environment disables analytics', async () => {
    env.DISABLE_ANALYTICS = true;
    await reportProtocolUpgradeFailures(
      [storedProtocolFailure()],
      settings({}),
    );
    expect(capture).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('sends nothing when the deployment disabled analytics', async () => {
    await reportProtocolUpgradeFailures(
      [storedProtocolFailure()],
      settings({ disableAnalytics: 'true' }),
    );
    expect(capture).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('sends nothing when the setting cannot be read, and does not throw', async () => {
    const unreadable = {
      appSettings: { findUnique: vi.fn().mockRejectedValue(new Error('down')) },
    };
    await expect(
      reportProtocolUpgradeFailures([storedProtocolFailure()], unreadable),
    ).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });
});
