import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartPostHog } = vi.hoisted(() => ({
  mockStartPostHog: vi.fn(() => Promise.resolve()),
}));

vi.mock('~/lib/posthog-client', () => ({
  startPostHog: mockStartPostHog,
}));

import { PostHogBootstrap } from '../PosthogBootstrap';

describe('PostHogBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts PostHog with the installation ID', () => {
    render(<PostHogBootstrap installationId="install-123" />);

    expect(mockStartPostHog).toHaveBeenCalledWith('install-123');
  });

  it('starts PostHog when there is no installation ID yet', () => {
    render(<PostHogBootstrap installationId={undefined} />);

    expect(mockStartPostHog).toHaveBeenCalledWith(undefined);
  });
});
