import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  POSTHOG_INSTANCE_NAME,
} from '../config';

const init = vi.fn();
const loadExceptionAutocapture = vi.fn();

beforeEach(() => {
  // getAnalyticsClient memoises its promise for the life of the module, so
  // every test starts from a fresh module graph.
  vi.resetModules();
  vi.stubEnv('VITE_DISABLE_ANALYTICS', 'false');
  vi.doMock('posthog-js/dist/module.no-external', () => ({
    default: { init },
  }));
  vi.doMock('posthog-js/dist/exception-autocapture', () => {
    loadExceptionAutocapture();
    return {};
  });
});

afterEach(() => {
  vi.doUnmock('posthog-js/dist/module.no-external');
  vi.doUnmock('posthog-js/dist/exception-autocapture');
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('getAnalyticsClient', () => {
  it('initialises a named, opted-out client that never fetches extensions', async () => {
    const client = { capture: vi.fn() };
    init.mockReturnValue(client);

    const { getAnalyticsClient } = await import('../client');

    await expect(getAnalyticsClient()).resolves.toBe(client);
    expect(init).toHaveBeenCalledWith(
      POSTHOG_API_KEY,
      expect.objectContaining({
        api_host: POSTHOG_HOST,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        capture_exceptions: true,
        disable_external_dependency_loading: true,
        opt_out_capturing_by_default: true,
      }),
      POSTHOG_INSTANCE_NAME,
    );
  });

  // The no-external build cannot fetch extensions, so `capture_exceptions`
  // only does anything if exception autocapture is bundled alongside it and
  // has registered itself before init runs.
  it('loads the bundled exception-autocapture extension before init', async () => {
    const { getAnalyticsClient } = await import('../client');

    await getAnalyticsClient();

    expect(loadExceptionAutocapture).toHaveBeenCalledOnce();
    const [preloadOrder] = loadExceptionAutocapture.mock.invocationCallOrder;
    const [initOrder] = init.mock.invocationCallOrder;
    expect(initOrder).toBeGreaterThan(preloadOrder ?? Number.POSITIVE_INFINITY);
  });

  it('shares one client between callers', async () => {
    init.mockReturnValue({ capture: vi.fn() });
    const { getAnalyticsClient } = await import('../client');

    const [first, second] = await Promise.all([
      getAnalyticsClient(),
      getAnalyticsClient(),
    ]);

    expect(first).toBe(second);
    expect(init).toHaveBeenCalledOnce();
  });

  it('never loads posthog-js when analytics are disabled at build time', async () => {
    vi.stubEnv('VITE_DISABLE_ANALYTICS', 'true');
    const { getAnalyticsClient } = await import('../client');

    await expect(getAnalyticsClient()).resolves.toBeNull();
    expect(init).not.toHaveBeenCalled();
    expect(loadExceptionAutocapture).not.toHaveBeenCalled();
  });

  it('runs without analytics when posthog-js fails to load', async () => {
    vi.doMock('posthog-js/dist/module.no-external', () => {
      throw new Error('simulated chunk load failure');
    });
    const { getAnalyticsClient } = await import('../client');

    await expect(getAnalyticsClient()).resolves.toBeNull();
  });
});
