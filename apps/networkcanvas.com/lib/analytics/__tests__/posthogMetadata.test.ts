import { beforeAll, describe, expect, it, vi } from 'vitest';

import pkg from '../../../package.json' with { type: 'json' };
import { POSTHOG_APP_PROPERTIES } from '../posthogMetadata';

const { init, register } = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { init, register },
}));

vi.mock('../isProductionHost', () => ({
  isProductionHost: () => true,
}));

describe('POSTHOG_APP_PROPERTIES', () => {
  beforeAll(async () => {
    await import('../../../instrumentation-client');
  });

  it('uses the Website name and current package version', () => {
    expect(POSTHOG_APP_PROPERTIES).toEqual({
      app: 'Website',
      $app_name: 'Website',
      host_version: pkg.version,
      $app_version: pkg.version,
    });
  });

  it('registers the metadata on the production PostHog client', () => {
    expect(init).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith({
      ...POSTHOG_APP_PROPERTIES,
      installation_id: 'website-production',
    });
  });
});
