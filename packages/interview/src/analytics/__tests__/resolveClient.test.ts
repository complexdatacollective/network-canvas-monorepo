import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeClient = {
  capture: vi.fn(),
  register: vi.fn(),
  captureException: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('posthog-js');
  vi.doUnmock('posthog-js/dist/module.no-external');
});

describe('resolveClient', () => {
  it('returns null when disableAnalytics is true', async () => {
    const { resolveClient } = await import('../resolveClient');
    const result = await resolveClient({ disableAnalytics: true });
    expect(result).toBeNull();
  });

  it('returns the supplied host client unchanged when disableAnalytics is false', async () => {
    const { resolveClient } = await import('../resolveClient');
    const result = await resolveClient({
      disableAnalytics: false,
      posthogClient: fakeClient as never,
    });
    expect(result).toBe(fakeClient);
    expect(fakeClient.register).not.toHaveBeenCalled();
  });

  // The own instance must come from the build without a remote script loader:
  // the default entrypoint would try to fetch extensions from the relay, which
  // a host's `script-src 'self'` policy blocks.
  it('dynamically imports the no-external posthog-js build and inits a named instance when no host client', async () => {
    const initSpy = vi.fn().mockReturnValue(fakeClient);
    vi.doMock('posthog-js', () => {
      throw new Error('the default posthog-js entrypoint must not be imported');
    });
    vi.doMock('posthog-js/dist/module.no-external', () => ({
      default: { init: initSpy },
    }));
    const { resolveClient } = await import('../resolveClient');
    const result = await resolveClient({ disableAnalytics: false });
    expect(initSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ api_host: expect.any(String) }),
      '@codaco/interview',
    );
    expect(result).toBe(fakeClient);
  });

  it('returns null when dynamic import fails', async () => {
    vi.doMock('posthog-js/dist/module.no-external', () => {
      throw new Error('simulated chunk load failure');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { resolveClient } = await import('../resolveClient');
    const result = await resolveClient({ disableAnalytics: false });
    expect(result).toBeNull();
  });
});
