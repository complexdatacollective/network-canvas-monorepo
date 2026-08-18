import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCapture,
  mockCaptureException,
  mockFlush,
  mockGetDisableAnalytics,
  mockGetInstallationId,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockCaptureException: vi.fn(),
  mockFlush: vi.fn().mockResolvedValue(undefined),
  mockGetDisableAnalytics: vi.fn(),
  mockGetInstallationId: vi.fn(),
}));

vi.mock('posthog-node', () => {
  const MockPostHog = vi.fn(function (this: Record<string, unknown>) {
    this.capture = mockCapture;
    this.captureException = mockCaptureException;
    this.flush = mockFlush;
  });
  return { PostHog: MockPostHog };
});

vi.mock('~/queries/appSettings', () => ({
  getDisableAnalytics: mockGetDisableAnalytics,
  getInstallationId: mockGetInstallationId,
}));

vi.mock('~/fresco.config', () => ({
  POSTHOG_API_KEY: 'test-api-key',
  POSTHOG_APP_NAME: 'Fresco',
  POSTHOG_PROXY_HOST: 'https://test.example.com',
}));

describe('posthog-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('captureEvent', () => {
    it('returns early when analytics disabled', async () => {
      mockGetDisableAnalytics.mockResolvedValue(true);

      const { captureEvent } = await import('../posthog-server');
      await captureEvent('test-event', { key: 'value' });

      expect(mockGetDisableAnalytics).toHaveBeenCalled();
      expect(mockGetInstallationId).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('calls capture with correct args when analytics enabled', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');

      const { captureEvent } = await import('../posthog-server');
      await captureEvent('test-event', { key: 'value' });

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: 'install-123',
        event: 'test-event',
        properties: {
          app: 'Fresco',
          installation_id: 'install-123',
          key: 'value',
          $source: 'server',
        },
      });
    });

    it('swallows errors thrown by underlying lookups', async () => {
      mockGetDisableAnalytics.mockRejectedValue(new Error('db down'));

      const { captureEvent } = await import('../posthog-server');

      await expect(
        captureEvent('test-event', { key: 'value' }),
      ).resolves.toBeUndefined();
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe('captureException', () => {
    it('returns early when analytics disabled', async () => {
      mockGetDisableAnalytics.mockResolvedValue(true);

      const { captureException } = await import('../posthog-server');
      await captureException(new Error('test'), { extra: 'data' });

      expect(mockGetDisableAnalytics).toHaveBeenCalled();
      expect(mockGetInstallationId).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('calls captureException with correct args when analytics enabled', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');

      const error = new Error('test error');
      const { captureException } = await import('../posthog-server');
      await captureException(error, { extra: 'data' });

      expect(mockCaptureException).toHaveBeenCalledWith(error, 'install-123', {
        extra: 'data',
      });
    });

    it('swallows errors thrown by underlying lookups', async () => {
      mockGetDisableAnalytics.mockRejectedValue(new Error('db down'));

      const { captureException } = await import('../posthog-server');

      await expect(
        captureException(new Error('test'), { extra: 'data' }),
      ).resolves.toBeUndefined();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('flushPostHog', () => {
    it('flushes what has been captured', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');

      const { captureEvent, flushPostHog } = await import('../posthog-server');

      await captureEvent('init-event');
      expect(mockCapture).toHaveBeenCalledTimes(1);

      await flushPostHog();
      expect(mockFlush).toHaveBeenCalledTimes(1);
    });

    // One request can queue several `after` callbacks — a route's telemetry
    // alongside activity recorded by the action it called — and Next runs them
    // concurrently against one shared client. Tearing that client down let
    // whichever finished first strand the other's event; every flush must
    // reach the client that holds it.
    it('flushes for every caller sharing the client', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');

      const { captureEvent, flushPostHog } = await import('../posthog-server');

      // Two callbacks capture against the one shared client...
      await captureEvent('route-event');
      await captureEvent('activity-event');

      // ...and each then flushes what it captured. Under a teardown the first
      // would drop the shared client, and the second would find nothing to
      // flush and return with its event still queued.
      await flushPostHog();
      await flushPostHog();

      expect(mockFlush).toHaveBeenCalledTimes(2);
    });

    it('does not throw when the client has nothing to flush', async () => {
      const { flushPostHog } = await import('../posthog-server');

      await expect(flushPostHog()).resolves.toBeUndefined();
      expect(mockFlush).not.toHaveBeenCalled();
    });

    it('swallows a failing flush', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');
      mockFlush.mockRejectedValueOnce(new Error('network down'));

      const { captureEvent, flushPostHog } = await import('../posthog-server');

      await captureEvent('init-event');

      await expect(flushPostHog()).resolves.toBeUndefined();
    });
  });
});
