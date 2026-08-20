import { afterEach, describe, expect, it, vi } from 'vitest';

import { POSTHOG_API_KEY, POSTHOG_HOST } from '@codaco/shared-consts';

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

    initializeAnalytics({ disabled: false, isDevelopment: false });

    expect(init).toHaveBeenCalledWith(
      POSTHOG_API_KEY,
      expect.objectContaining({
        api_host: POSTHOG_HOST,
        person_profiles: 'identified_only',
      }),
    );
    expect(register).toHaveBeenCalledWith({
      app: 'ArchitectWeb',
      $app_name: 'Architect',
      host_version: appVersion,
      $app_version: appVersion,
      installation_id: 'installation-id',
    });
    expect(identify).not.toHaveBeenCalled();
  });

  // Architect used to read its project key from a build-time variable and
  // return early when it was absent, so a release built without the variable
  // shipped with telemetry silently off and nothing failed. The key is public
  // PostHog data shared by every product, so it is compiled in: there is no
  // longer an environment in which analytics can fail open.
  it('reports to the same project as every other product, with nothing configured', () => {
    initializeAnalytics({ disabled: false, isDevelopment: false });

    expect(init).toHaveBeenCalledOnce();
    expect(init.mock.calls[0]?.[0]).toBe(POSTHOG_API_KEY);
  });

  it.each([
    {
      name: 'development mode',
      environment: { disabled: false, isDevelopment: true },
    },
    {
      name: 'an explicit disable override',
      environment: { disabled: true, isDevelopment: false },
    },
  ])('does not initialize for $name', ({ environment }) => {
    initializeAnalytics(environment);

    expect(init).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
  });
});
