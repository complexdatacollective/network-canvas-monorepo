import { Toast } from '@base-ui/react/toast';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

let online = true;
vi.mock('~/hooks/useOnline', () => ({
  default: () => online,
}));
vi.mock('../../analytics/useTrack', () => ({
  useCaptureException: () => vi.fn(),
}));

import StageErrorBoundary from '../StageErrorBoundary';

function Boom(): ReactNode {
  throw new Error('WebGL init failed');
}

// The error state renders CopyDebugInfoButton, whose useToast call requires a
// Toast.Provider ancestor — Shell provides one in production.
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
});
