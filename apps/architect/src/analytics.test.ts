import { afterEach, describe, expect, it, vi } from 'vitest';

import { appVersion } from './utils/appVersion';

const { init, register, identify } = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { identify, init, register },
}));

import { initializeAnalytics } from './analytics';

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('initializeAnalytics', () => {
  it('initializes production analytics with anonymous app metadata', () => {
    localStorage.setItem(
      'network-canvas-architect-installation-id',
      'installation-id',
    );

    initializeAnalytics({
      apiKey: 'public-project-key',
      disabled: false,
      isDevelopment: false,
    });

    expect(init).toHaveBeenCalledWith(
      'public-project-key',
      expect.objectContaining({
        api_host: 'https://ph-relay.networkcanvas.com',
        person_profiles: 'identified_only',
      }),
    );
    expect(register).toHaveBeenCalledWith({
      app: 'ArchitectWeb',
      $app_name: 'ArchitectWeb',
      host_version: appVersion,
      $app_version: appVersion,
      installation_id: 'installation-id',
    });
    expect(identify).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'development mode',
      environment: {
        apiKey: 'public-project-key',
        disabled: false,
        isDevelopment: true,
      },
    },
    {
      name: 'an explicit disable override',
      environment: {
        apiKey: 'public-project-key',
        disabled: true,
        isDevelopment: false,
      },
    },
    {
      name: 'a missing public project key',
      environment: {
        apiKey: undefined,
        disabled: false,
        isDevelopment: false,
      },
    },
  ])('does not initialize for $name', ({ environment }) => {
    initializeAnalytics(environment);

    expect(init).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
  });
});
