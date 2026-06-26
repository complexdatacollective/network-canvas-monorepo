import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseRegisterSW } = vi.hoisted(() => ({
  mockUseRegisterSW: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

import PwaUpdateBanner from '../PwaUpdateBanner';

const setSwState = ({
  offlineReady = false,
  needRefresh = false,
  updateServiceWorker = vi.fn(),
}: {
  offlineReady?: boolean;
  needRefresh?: boolean;
  updateServiceWorker?: ReturnType<typeof vi.fn>;
}) => {
  mockUseRegisterSW.mockReturnValue({
    offlineReady: [offlineReady, vi.fn()],
    needRefresh: [needRefresh, vi.fn()],
    updateServiceWorker,
  });
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('PwaUpdateBanner', () => {
  it('renders nothing when there is no update and the app is not offline-ready', () => {
    setSwState({});
    const { container } = render(<PwaUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the update prompt and triggers a reloading update on click', () => {
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });
    render(<PwaUpdateBanner />);

    expect(
      screen.getByText(/new version of Architect is available/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('shows the offline-ready confirmation', () => {
    setSwState({ offlineReady: true });
    render(<PwaUpdateBanner />);
    expect(screen.getByText(/ready to work offline/i)).toBeInTheDocument();
  });
});
