import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDisableAnalytics, mockGetInstallationId } = vi.hoisted(() => ({
  mockGetDisableAnalytics: vi.fn(),
  mockGetInstallationId: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: () => Promise.resolve(),
}));

vi.mock('~/queries/appSettings', () => ({
  getDisableAnalytics: mockGetDisableAnalytics,
  getInstallationId: mockGetInstallationId,
}));

import AnalyticsLoader from '../AnalyticsLoader';
import { PostHogBootstrap } from '../PosthogBootstrap';

describe('AnalyticsLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInstallationId.mockResolvedValue('install-123');
  });

  // PostHog contacts the relay as soon as it initialises, and opting out
  // afterwards does not take those requests back, so the browser must be told
  // not to load it at all.
  it('disables the bootstrap when analytics are disabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(true);

    await expect(AnalyticsLoader()).resolves.toEqual(
      expect.objectContaining({
        type: PostHogBootstrap,
        props: { enabled: false },
      }),
    );
  });

  it('does not even look up the installation ID when analytics are disabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(true);

    await AnalyticsLoader();

    expect(mockGetInstallationId).not.toHaveBeenCalled();
  });

  it('enables the bootstrap with the installation ID when analytics are enabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(false);

    await expect(AnalyticsLoader()).resolves.toEqual(
      expect.objectContaining({
        type: PostHogBootstrap,
        props: { enabled: true, installationId: 'install-123' },
      }),
    );
  });

  it('stays disabled when the settings cannot be read', async () => {
    mockGetDisableAnalytics.mockRejectedValue(new Error('database is down'));

    await expect(AnalyticsLoader()).resolves.toEqual(
      expect.objectContaining({ props: { enabled: false } }),
    );
  });
});
