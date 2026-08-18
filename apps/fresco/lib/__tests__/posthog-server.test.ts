import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCapture,
  mockCaptureException,
  mockShutdown,
  mockGetDisableAnalytics,
  mockGetInstallationId,
  mockHeaders,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockCaptureException: vi.fn(),
  mockShutdown: vi.fn().mockResolvedValue(undefined),
  mockGetDisableAnalytics: vi.fn(),
  mockGetInstallationId: vi.fn(),
  mockHeaders: vi.fn(),
}));

vi.mock('posthog-node', () => {
  const MockPostHog = vi.fn(function (this: Record<string, unknown>) {
    this.capture = mockCapture;
    this.captureException = mockCaptureException;
    this.shutdown = mockShutdown;
  });
  return { PostHog: MockPostHog };
});

vi.mock('~/queries/appSettings', () => ({
  getDisableAnalytics: mockGetDisableAnalytics,
  getInstallationId: mockGetInstallationId,
}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('~/fresco.config', () => ({
  POSTHOG_API_KEY: 'test-api-key',
  POSTHOG_APP_PROPERTIES: {
    app: 'Fresco',
    $app_name: 'Fresco',
    host_version: '4.1.1',
    $app_version: '4.1.1',
  },
  POSTHOG_PROXY_HOST: 'https://test.example.com',
}));

describe('posthog-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockHeaders.mockResolvedValue(new Headers());
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
          $app_name: 'Fresco',
          host_version: '4.1.1',
          $app_version: '4.1.1',
          installation_id: 'install-123',
          key: 'value',
          $source: 'server',
        },
      });
    });

    it('adds the browser session ID to server events', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');
      mockHeaders.mockResolvedValue(
        new Headers({ 'x-posthog-session-id': 'browser-session-123' }),
      );

      const { captureEvent } = await import('../posthog-server');
      await captureEvent('test-event');

      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: 'install-123',
          properties: expect.objectContaining({
            $session_id: 'browser-session-123',
          }),
        }),
      );
    });

    it('still captures outside a browser request context', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');
      mockHeaders.mockRejectedValue(new Error('no request context'));

      const { captureEvent } = await import('../posthog-server');
      await captureEvent('background-event');

      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.not.objectContaining({
            $session_id: expect.anything(),
          }),
        }),
      );
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
        app: 'Fresco',
        $app_name: 'Fresco',
        host_version: '4.1.1',
        $app_version: '4.1.1',
        installation_id: 'install-123',
        $source: 'server',
      });
    });

    it('adds the browser session ID to server exceptions', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');
      mockHeaders.mockResolvedValue(
        new Headers({ 'x-posthog-session-id': 'browser-session-123' }),
      );

      const error = new Error('test error');
      const { captureException } = await import('../posthog-server');
      await captureException(error);

      expect(mockCaptureException).toHaveBeenCalledWith(
        error,
        'install-123',
        expect.objectContaining({
          $session_id: 'browser-session-123',
        }),
      );
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

  describe('shutdownPostHog', () => {
    it('calls shutdown and allows re-initialization', async () => {
      mockGetDisableAnalytics.mockResolvedValue(false);
      mockGetInstallationId.mockResolvedValue('install-123');

      const { captureEvent, shutdownPostHog } =
        await import('../posthog-server');

      // Initialize the client by making a call
      await captureEvent('init-event');
      expect(mockCapture).toHaveBeenCalledTimes(1);

      // Shutdown
      await shutdownPostHog();
      expect(mockShutdown).toHaveBeenCalledTimes(1);

      // Re-initialize by making another call
      await captureEvent('post-shutdown-event');
      expect(mockCapture).toHaveBeenCalledTimes(2);
    });
  });
});
