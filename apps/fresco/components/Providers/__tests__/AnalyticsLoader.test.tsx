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

/** The decision the rendered tag publishes. */
async function publishedDecision() {
  const element = await AnalyticsLoader();
  const { name, content } = element.props;

  expect(name).toBe('fresco-analytics');
  expect(typeof content).toBe('string');

  return JSON.parse(String(content)) as Record<string, unknown>;
}

describe('AnalyticsLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInstallationId.mockResolvedValue('install-123');
  });

  // PostHog contacts the relay as soon as it initialises, and opting out
  // afterwards does not take those requests back, so the browser must be told
  // not to load it at all.
  it('publishes a disabled decision when analytics are disabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(true);

    await expect(publishedDecision()).resolves.toEqual({ enabled: false });
  });

  it('does not even look up the installation ID when analytics are disabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(true);

    await AnalyticsLoader();

    expect(mockGetInstallationId).not.toHaveBeenCalled();
  });

  it('publishes the installation ID when analytics are enabled', async () => {
    mockGetDisableAnalytics.mockResolvedValue(false);

    await expect(publishedDecision()).resolves.toEqual({
      enabled: true,
      installationId: 'install-123',
    });
  });

  it('stays disabled when the settings cannot be read', async () => {
    mockGetDisableAnalytics.mockRejectedValue(new Error('database is down'));

    await expect(publishedDecision()).resolves.toEqual({ enabled: false });
  });

  // The value reaches the browser as an attribute, so it is escaped by React
  // rather than being parsed as code. Recorded here because publishing it as
  // an inline script instead — the obvious alternative — would not have this
  // property.
  it('cannot be broken out of by an installation ID', async () => {
    mockGetDisableAnalytics.mockResolvedValue(false);
    mockGetInstallationId.mockResolvedValue(
      '</script><script>alert(1)</script>',
    );

    await expect(publishedDecision()).resolves.toEqual({
      enabled: true,
      installationId: '</script><script>alert(1)</script>',
    });
  });
});
