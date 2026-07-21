import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PostHogClientProvider } from '../posthog-provider';

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { captureException },
}));

function Thrower(): never {
  throw new Error('boom');
}

describe('PostHogClientProvider', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    captureException.mockClear();
  });

  it('renders children while the app is healthy', () => {
    render(
      <PostHogClientProvider>
        <p>Documentation content</p>
      </PostHogClientProvider>,
    );

    expect(screen.getByText('Documentation content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows recovery actions and reports unexpected render errors', () => {
    render(
      <PostHogClientProvider>
        <Thrower />
      </PostHogClientProvider>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reload page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Documentation home' }),
    ).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      { feature: 'app-error-boundary' },
    );
  });
});
