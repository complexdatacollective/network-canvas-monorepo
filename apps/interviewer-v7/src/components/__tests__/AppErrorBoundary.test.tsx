import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';

import { AppErrorBoundary } from '../AppErrorBoundary';

const captureException = vi.fn();

vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ captureException }),
}));

// The real Dialog (motion animations) and BackgroundBlobs (canvas loop) hang
// under jsdom — fresco-ui tests them in its own suite. Stub them here and
// assert the props the boundary passes; the full dialog render is covered by
// AppErrorBoundary.stories.tsx in the browser-based storybook test project.
vi.mock('@codaco/fresco-ui/dialogs/Dialog', () => ({
  default: ({ open, dismissible, title, description, footer }: DialogProps) =>
    open ? (
      <dialog open aria-label={title}>
        <h2>{title}</h2>
        <p>{description}</p>
        {dismissible !== false && <button type="button">Close</button>}
        {footer}
      </dialog>
    ) : null,
}));

vi.mock('@codaco/art', () => ({
  BackgroundBlobs: () => null,
}));

function Thrower(): never {
  throw new Error('boom');
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors to console.error; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    captureException.mockClear();
  });

  it('renders children when no error occurs', () => {
    render(
      <AppErrorBoundary>
        <p>app content</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('app content')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a non-dismissible error dialog when a child throws', () => {
    render(
      <AppErrorBoundary>
        <Thrower />
      </AppErrorBoundary>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
  });

  it('reports the error to analytics', () => {
    render(
      <AppErrorBoundary>
        <Thrower />
      </AppErrorBoundary>,
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      expect.objectContaining({ feature: 'react-error-boundary' }),
    );
  });
});
