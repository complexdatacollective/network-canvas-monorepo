import { isValidElement } from 'react';
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
  // afterwards does not take those requests back. A deployment that disabled
  // analytics must therefore never be sent the component that loads it.
  it('renders nothing when analytics are disabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(true);

    await expect(AnalyticsLoader()).resolves.toBeNull();
  });

  it('does not even look up the installation ID when analytics are disabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(true);

    await AnalyticsLoader();

    expect(mockGetInstallationId).not.toHaveBeenCalled();
  });

  it('renders the bootstrap with the installation ID when analytics are enabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(false);

    const result = await AnalyticsLoader();

    expect(isValidElement(result)).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        type: PostHogBootstrap,
        props: { installationId: 'install-123' },
      }),
    );
  });

  it('stays silent when the settings cannot be read', async () => {
    mockGetDisableAnalytics.mockRejectedValue(new Error('database is down'));

    await expect(AnalyticsLoader()).resolves.toBeNull();
  });
});
