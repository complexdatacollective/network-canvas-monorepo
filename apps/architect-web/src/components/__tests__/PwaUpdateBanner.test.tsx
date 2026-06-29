import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseRegisterSW } = vi.hoisted(() => ({
  mockUseRegisterSW: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

import PwaUpdateBanner from '../PwaUpdateBanner';

// Matches FRESH_LOAD_WINDOW_MS in the component.
const PAST_FRESH_LOAD = 25_000;

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
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('PwaUpdateBanner', () => {
  it('renders nothing when there is no update', () => {
    setSwState({});
    const { container } = render(<PwaUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('silently applies a pending update on a fresh load (no prompt)', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });

    const { container } = render(<PwaUpdateBanner />);

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(container).toBeEmptyDOMElement();
  });

  it('prompts for an update that appears during an open session', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: false, updateServiceWorker });
    const { rerender } = render(<PwaUpdateBanner />);

    // Settle past the fresh-load window, then an update appears.
    act(() => {
      vi.advanceTimersByTime(PAST_FRESH_LOAD);
    });
    setSwState({ needRefresh: true, updateServiceWorker });
    act(() => rerender(<PwaUpdateBanner />));

    expect(
      screen.getByText(/new version of Architect is available/i),
    ).toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('starts an update-check interval on registration and clears it on unmount', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

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
