import { beforeAll, describe, expect, it, vi } from 'vitest';

import { POSTHOG_API_KEY, POSTHOG_HOST } from '@codaco/shared-consts';

import pkg from '../../../package.json' with { type: 'json' };

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

// The metadata SHAPE is covered once, on the shared helper
// (packages/shared-consts/src/__tests__/posthog.test.ts). What is specific to
// this site — and so tested here — is that it reports under its own identity,
// to the shared project, through the shared relay.
describe('Website analytics wiring', () => {
  beforeAll(async () => {
    await import('../../../instrumentation-client');
  });

  it('initialises the shared PostHog project through the relay', () => {
    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      POSTHOG_API_KEY,
      expect.objectContaining({ api_host: POSTHOG_HOST }),
    );
  });

  it("registers this site's identity and current version", () => {
    expect(register).toHaveBeenCalledWith({
      app: 'Website',
      $app_name: 'Website',
      host_version: pkg.version,
      $app_version: pkg.version,
      installation_id: 'website-production',
    });
  });
});
