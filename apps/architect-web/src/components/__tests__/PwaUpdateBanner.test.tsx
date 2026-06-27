import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseRegisterSW } = vi.hoisted(() => ({
  mockUseRegisterSW: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

import PwaUpdateBanner from '../PwaUpdateBanner';

const setSwState = ({
  needRefresh = false,
  updateServiceWorker = vi.fn(),
}: {
  needRefresh?: boolean;
  updateServiceWorker?: ReturnType<typeof vi.fn>;
}) => {
  mockUseRegisterSW.mockReturnValue({
    offlineReady: [false, vi.fn()],
    needRefresh: [needRefresh, vi.fn()],
    updateServiceWorker,
  });
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('PwaUpdateBanner', () => {
  it('renders nothing when there is no update', () => {
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

  it('starts an update-check interval on registration and clears it on unmount', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    // Invoke the registration callback (called asynchronously by the real hook)
    // so the component stores the registration and starts polling.
    let notifyRegistered: (() => void) | undefined;
    mockUseRegisterSW.mockImplementation((options) => {
      notifyRegistered = () => options?.onRegisteredSW?.('/sw.js', {});
      return {
        offlineReady: [false, vi.fn()],
        needRefresh: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      };
    });

    const { unmount } = render(<PwaUpdateBanner />);
    act(() => notifyRegistered?.());

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const intervalId = setIntervalSpy.mock.results[0]?.value;

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
  });
});
