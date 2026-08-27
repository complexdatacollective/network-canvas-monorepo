import { beforeEach, describe, expect, it, vi } from 'vitest';

const { init, register, identify, optInCapturing } = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  optInCapturing: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { init, register, identify, opt_in_capturing: optInCapturing },
}));

vi.mock('~/fresco.config', () => ({
  POSTHOG_API_KEY: 'phc_test',
  POSTHOG_PROXY_HOST: 'https://relay.example.com',
  POSTHOG_APP_PROPERTIES: {
    app: 'Fresco',
    $app_name: 'Fresco',
    host_version: '4.1.1',
    $app_version: '4.1.1',
  },
}));

async function loadModule() {
  vi.resetModules();
  return import('../posthog-client');
}

describe('Fresco PostHog client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The whole point of the module: importing it must be inert, so that a
  // deployment with analytics disabled never reaches the relay. PostHog fires
  // its remote-config, extension-script and feature-flag requests the instant
  // init() runs, and opting out afterwards does not prevent them.
  it('does not initialise PostHog on import', async () => {
    await loadModule();

    expect(init).not.toHaveBeenCalled();
  });

  it('initialises PostHog only once startPostHog is called', async () => {
    const { startPostHog } = await loadModule();

    await startPostHog('install-123');

    expect(init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        api_host: 'https://relay.example.com',
        // Propagates the browser session to same-origin server requests.
        tracing_headers: [window.location.hostname],
      }),
    );
  });

  it('opts a previously opted-out browser back in', async () => {
    const { startPostHog } = await loadModule();

    await startPostHog('install-123');

    expect(optInCapturing).toHaveBeenCalled();
  });

  it('registers the app properties and identifies by installation ID', async () => {
    const { startPostHog } = await loadModule();

    await startPostHog('install-123');

    expect(register).toHaveBeenCalledWith({
      app: 'Fresco',
      $app_name: 'Fresco',
      host_version: '4.1.1',
      $app_version: '4.1.1',
      installation_id: 'install-123',
    });
    expect(identify).toHaveBeenCalledWith('install-123');
  });

  it('registers the app properties but does not identify without an installation ID', async () => {
    const { startPostHog } = await loadModule();

    await startPostHog(undefined);

    expect(register).toHaveBeenCalledWith({
      app: 'Fresco',
      $app_name: 'Fresco',
      host_version: '4.1.1',
      $app_version: '4.1.1',
    });
    expect(identify).not.toHaveBeenCalled();
  });

  it('never throws when PostHog fails to start', async () => {
    init.mockImplementationOnce(() => {
      throw new Error('chunk failed to load');
    });
    const { startPostHog } = await loadModule();

    await expect(startPostHog('install-123')).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('initialises once however many times it is started', async () => {
    const { startPostHog } = await loadModule();

    await startPostHog('install-123');
    await startPostHog('install-123');

    expect(init).toHaveBeenCalledOnce();
    expect(optInCapturing).toHaveBeenCalledOnce();
  });
});
