import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseRegisterSW, mockUseLocation } = vi.hoisted(() => ({
  mockUseRegisterSW: vi.fn(),
  mockUseLocation: vi.fn(() => ['/']),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

vi.mock('wouter', () => ({
  useLocation: mockUseLocation,
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
  mockUseLocation.mockReturnValue(['/']);
});

describe('PwaUpdateBanner', () => {
  it('renders nothing when there is no update', () => {
    setSwState({});
    const { container } = render(<PwaUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  // Regression: an earlier fresh-load window applied pending updates silently
  // (the app appeared to restart itself). Updates must ALWAYS prompt.
  it('prompts for a pending update instead of silently reloading', () => {
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });

    render(<PwaUpdateBanner />);

    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(
      screen.getByText(/new version of Interviewer is available/i),
    ).toBeInTheDocument();
  });

  it('reloads only on the explicit Reload action', () => {
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });

    render(<PwaUpdateBanner />);

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('can be dismissed for the session', async () => {
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });

    render(<PwaUpdateBanner />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    // The exit animation holds the element in the DOM for a beat.
    await waitFor(() =>
      expect(
        screen.queryByText(/new version of Interviewer is available/i),
      ).not.toBeInTheDocument(),
    );
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('withholds the prompt while an interview is active, then surfaces it', () => {
    mockUseLocation.mockReturnValue(['/interview/abc-123']);
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });
    const { rerender } = render(<PwaUpdateBanner />);

    // Mid-interview: no prompt, and certainly no reload.
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/new version of Interviewer is available/i),
    ).not.toBeInTheDocument();

    // The researcher returns Home: the pending update now surfaces.
    mockUseLocation.mockReturnValue(['/']);
    act(() => rerender(<PwaUpdateBanner />));
    expect(
      screen.getByText(/new version of Interviewer is available/i),
    ).toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();
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
