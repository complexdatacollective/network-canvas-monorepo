import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ANALYTICS_DECISION_META_NAME } from '~/lib/analyticsDecision';

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

// Renders the decision it was handed, so the test can read it from markup.
vi.mock('~/components/Providers/ApplyAnalyticsDecision', () => ({
  default: ({ decision }: { decision: unknown }) => (
    <output data-applied-decision={JSON.stringify(decision)} />
  ),
}));

import AnalyticsLoader from '../AnalyticsLoader';

async function renderLoader() {
  const markup = renderToStaticMarkup(await AnalyticsLoader());
  const container = document.createElement('div');
  container.innerHTML = markup;
  return { markup, container };
}

/** The decision the rendered tag publishes, read as instrumentation-client reads it. */
async function publishedDecision() {
  const { container } = await renderLoader();
  const content = container
    .querySelector(`meta[name="${ANALYTICS_DECISION_META_NAME}"]`)
    ?.getAttribute('content');

  if (typeof content !== 'string') {
    throw new TypeError('no decision was published');
  }

  return JSON.parse(content);
}

/** The decision handed to the component that follows later changes. */
async function appliedDecision() {
  const { container } = await renderLoader();
  const applied = container
    .querySelector('[data-applied-decision]')
    ?.getAttribute('data-applied-decision');

  if (typeof applied !== 'string') {
    throw new TypeError('no decision was applied');
  }

  return JSON.parse(applied);
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

  // The tag is read once, at page load. A researcher turning analytics off in
  // a tab that is already open re-renders this, and the tab has to stop
  // capturing without waiting for a reload.
  it('also hands the decision to the component that follows later changes', async () => {
    mockGetDisableAnalytics.mockResolvedValue(false);

    await expect(appliedDecision()).resolves.toEqual({
      enabled: true,
      installationId: 'install-123',
    });
  });

  // The value reaches the browser as an attribute, so it is escaped rather
  // than being parsed as code. Publishing it as an inline script instead, the
  // obvious alternative, would not have this property.
  it('cannot be broken out of by an installation ID', async () => {
    const hostile = '"></meta></script><script>alert(1)</script>';
    mockGetDisableAnalytics.mockResolvedValue(false);
    mockGetInstallationId.mockResolvedValue(hostile);

    const { markup, container } = await renderLoader();

    expect(markup).not.toContain('<script');
    expect(container.querySelector('script')).toBeNull();
    await expect(publishedDecision()).resolves.toEqual({
      enabled: true,
      installationId: hostile,
    });
  });
});
