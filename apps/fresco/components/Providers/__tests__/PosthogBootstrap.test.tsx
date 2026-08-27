import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartPostHog, mockStopPostHog } = vi.hoisted(() => ({
  mockStartPostHog: vi.fn(() => Promise.resolve()),
  mockStopPostHog: vi.fn(() => Promise.resolve()),
}));

vi.mock('~/lib/posthog-client', () => ({
  startPostHog: mockStartPostHog,
  stopPostHog: mockStopPostHog,
}));

import { PostHogBootstrap } from '../PosthogBootstrap';

describe('PostHogBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts PostHog with the installation ID when enabled', () => {
    render(<PostHogBootstrap enabled installationId="install-123" />);

    expect(mockStartPostHog).toHaveBeenCalledWith('install-123');
    expect(mockStopPostHog).not.toHaveBeenCalled();
  });

  it('starts PostHog when there is no installation ID yet', () => {
    render(<PostHogBootstrap enabled installationId={undefined} />);

    expect(mockStartPostHog).toHaveBeenCalledWith(undefined);
  });

  // The deployment said no. Starting here is what would reach the relay.
  it('never starts PostHog when disabled', () => {
    render(<PostHogBootstrap enabled={false} />);

    expect(mockStartPostHog).not.toHaveBeenCalled();
  });

  // A researcher turning analytics off re-renders this component; without
  // this, a client already running in the tab would keep capturing.
  it('stops an already-running client when analytics are turned off', () => {
    const { rerender } = render(
      <PostHogBootstrap enabled installationId="install-123" />,
    );

    rerender(<PostHogBootstrap enabled={false} />);

    expect(mockStopPostHog).toHaveBeenCalled();
  });
});
