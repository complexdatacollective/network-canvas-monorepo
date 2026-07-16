import { Toast } from '@base-ui/react/toast';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

let online = true;
vi.mock('../../hooks/useOnline', () => ({
  default: () => online,
}));
vi.mock('../../analytics/useTrack', () => ({
  useCaptureException: () => vi.fn(),
}));

import StageErrorBoundary from '../StageErrorBoundary';

function Boom(): ReactNode {
  throw new Error('WebGL init failed');
}

// Mirrors how Shell wraps the app in production, to guard against future
// regressions that reintroduce a toast dependency into the fallback.
function renderWithToastProvider(ui: ReactNode) {
  return render(<Toast.Provider>{ui}</Toast.Provider>);
}

describe('StageErrorBoundary', () => {
  it('shows a generic message when a stage crashes while online', () => {
    online = true;
    renderWithToastProvider(
      <StageErrorBoundary>
        <Boom />
      </StageErrorBoundary>,
    );
    expect(screen.getByText('A problem occurred!')).toBeTruthy();
    expect(screen.queryByTestId('offline-error-message')).toBeNull();
  });

  it('shows an offline-aware message when a stage crashes while offline', () => {
    online = false;
    renderWithToastProvider(
      <StageErrorBoundary>
        <Boom />
      </StageErrorBoundary>,
    );
    expect(screen.getByTestId('offline-error-message')).toBeTruthy();
    expect(screen.queryByText('A problem occurred!')).toBeNull();
  });

  it('renders children when there is no error', () => {
    online = true;
    renderWithToastProvider(
      <StageErrorBoundary>
        <span>ok</span>
      </StageErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeTruthy();
  });

  // The fallback's debug-copy button must be self-sufficient: it must not
  // depend on a host-supplied Toast.Provider ancestor, since some hosts
  // (the e2e test host, architect's PreviewHost) don't provide one at
  // the top level. Deliberately omit any Toast.Provider here to prove that.
  it('renders a working copy-debug-info button with no Toast.Provider ancestor', async () => {
    online = true;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <StageErrorBoundary>
        <Boom />
      </StageErrorBoundary>,
    );

    expect(screen.getByText('A problem occurred!')).toBeTruthy();

    const copyButton = screen.getByRole('button', {
      name: /copy debug info/i,
    });
    expect(copyButton).toBeTruthy();

    expect(() => fireEvent.click(copyButton)).not.toThrow();

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]?.[0]).toContain('WebGL init failed');
  });
});
