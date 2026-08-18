import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureException,
  mockFlushPostHog,
  mockGetPostHogSessionProperties,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockFlushPostHog: vi.fn(),
  mockGetPostHogSessionProperties: vi.fn(),
}));

vi.mock('../../lib/posthog-server', () => ({
  flushPostHog: mockFlushPostHog,
  getPostHogServer: () => ({ captureException: mockCaptureException }),
  getPostHogSessionProperties: mockGetPostHogSessionProperties,
  POSTHOG_SESSION_ID_HEADER: 'x-posthog-session-id',
}));

vi.mock('../../env', () => ({
  env: { INSTALLATION_ID: 'install-123' },
}));

vi.mock('../../fresco.config', () => ({
  POSTHOG_APP_PROPERTIES: {
    app: 'Fresco',
    $app_name: 'Fresco',
    host_version: '4.1.1',
    $app_version: '4.1.1',
  },
}));

vi.mock('../../lib/db', () => ({
  prisma: { appSettings: { findUnique: vi.fn() } },
}));

describe('Fresco request-error instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    mockGetPostHogSessionProperties.mockReturnValue({
      $session_id: 'browser-session-123',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds the browser session ID to server request errors', async () => {
    const error = new Error('request failed');
    const { onRequestError } = await import('../../instrumentation');

    await onRequestError(
      error,
      {
        path: '/test',
        method: 'GET',
        headers: { 'x-posthog-session-id': 'browser-session-123' },
      },
      {
        routerKind: 'App Router',
        routePath: '/test',
        routeType: 'route',
        revalidateReason: undefined,
      },
    );

    expect(mockGetPostHogSessionProperties).toHaveBeenCalledWith(
      'browser-session-123',
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      'install-123',
      expect.objectContaining({
        $session_id: 'browser-session-123',
        $source: 'server',
      }),
    );
    expect(mockFlushPostHog).toHaveBeenCalledOnce();
  });
});
