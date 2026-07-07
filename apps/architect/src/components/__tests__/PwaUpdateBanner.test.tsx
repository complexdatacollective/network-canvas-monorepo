import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseRegisterSW } = vi.hoisted(() => ({
  mockUseRegisterSW: vi.fn(),
}));

type DialogConfig = { type: string; onConfirm?: () => void };

const { mockDispatch, mockOpenDialog, mockGetStageDraftDirty, selectorState } =
  vi.hoisted(() => ({
    mockDispatch: vi.fn(),
    mockOpenDialog: vi.fn((config: DialogConfig) => ({
      type: 'openDialog',
      config,
    })),
    mockGetStageDraftDirty: vi.fn(() => false),
    selectorState: { dialogs: { dialogs: [] as { id: string }[] } },
  }));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: typeof selectorState) => unknown) =>
    selector(selectorState),
}));

vi.mock('~/ducks/modules/dialogs', () => ({
  actionCreators: { openDialog: mockOpenDialog },
}));

vi.mock('~/selectors/stageEditorDraft', () => ({
  getStageDraftDirty: mockGetStageDraftDirty,
}));

import PwaUpdateBanner from '../PwaUpdateBanner';

// Matches FRESH_LOAD_WINDOW_MS in the component.
const PAST_FRESH_LOAD = 25_000;

// Captures the onNeedReload override the banner passes to useRegisterSW so tests
// can simulate the SW `controlling` event (the reload that clientsClaim delivers
// to *every* open tab when one tab accepts an update).
let capturedOnNeedReload: (() => void) | undefined;

const setSwState = ({
  needRefresh = false,
  updateServiceWorker = vi.fn(),
}: {
  needRefresh?: boolean;
  updateServiceWorker?: ReturnType<typeof vi.fn>;
}) => {
  mockUseRegisterSW.mockImplementation(
    (options?: { onNeedReload?: () => void }) => {
      capturedOnNeedReload = options?.onNeedReload;
      return {
        offlineReady: [false, vi.fn()],
        needRefresh: [needRefresh, vi.fn()],
        updateServiceWorker,
      };
    },
  );
};

const setWorkInProgress = ({
  draftDirty = false,
  openDialog = false,
}: {
  draftDirty?: boolean;
  openDialog?: boolean;
} = {}) => {
  mockGetStageDraftDirty.mockReturnValue(draftDirty);
  selectorState.dialogs.dialogs = openDialog ? [{ id: 'd1' }] : [];
};

// The confirm dialog resolves via redux-remember's promise-returning thunk; the
// mocked dispatch just needs a thenable so the banner's .finally() runs.
const resolvingDispatch = () => {
  mockDispatch.mockReturnValue(Promise.resolve(true));
};

// jsdom's window.location.reload is a non-configurable no-op; replace it with a
// spy so the cross-tab controlling-event reload is observable.
const mockReload = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, reload: mockReload },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
  capturedOnNeedReload = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
  setWorkInProgress();
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

  it('does not silently reload on a fresh load while work is in progress', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setWorkInProgress({ openDialog: true });
    setSwState({ needRefresh: true, updateServiceWorker });

    const { container } = render(<PwaUpdateBanner />);

    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('auto-applies once the in-progress work clears within the fresh-load window', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setWorkInProgress({ draftDirty: true });
    setSwState({ needRefresh: true, updateServiceWorker });

    const { rerender } = render(<PwaUpdateBanner />);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    setWorkInProgress({ draftDirty: false });
    act(() => rerender(<PwaUpdateBanner />));

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('falls through to the prompt if in-progress work outlasts the fresh-load window', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setWorkInProgress({ draftDirty: true });
    setSwState({ needRefresh: true, updateServiceWorker });

    render(<PwaUpdateBanner />);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(PAST_FRESH_LOAD);
    });

    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(
      screen.getByText(/new version of Architect is available/i),
    ).toBeInTheDocument();
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

  it('confirms before reloading from the banner when work is in progress', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    resolvingDispatch();
    setSwState({ needRefresh: false, updateServiceWorker });
    const { rerender } = render(<PwaUpdateBanner />);

    act(() => {
      vi.advanceTimersByTime(PAST_FRESH_LOAD);
    });
    setWorkInProgress({ draftDirty: true });
    setSwState({ needRefresh: true, updateServiceWorker });
    act(() => rerender(<PwaUpdateBanner />));

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));

    // A confirmation dialog is opened instead of reloading immediately.
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(mockOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Confirm' }),
    );

    // Confirming the dialog performs the reload.
    const config = mockOpenDialog.mock.calls[0]?.[0];
    config?.onConfirm?.();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('no longer claims "Your work is saved"', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: false, updateServiceWorker });
    const { rerender } = render(<PwaUpdateBanner />);

    act(() => {
      vi.advanceTimersByTime(PAST_FRESH_LOAD);
    });
    setSwState({ needRefresh: true, updateServiceWorker });
    act(() => rerender(<PwaUpdateBanner />));

    expect(screen.queryByText(/your work is saved/i)).not.toBeInTheDocument();
  });

  // #811: when another tab accepts an update, clientsClaim makes the new SW claim
  // *this* tab too, delivering a `controlling` event. vite-plugin-pwa's default
  // handler would window.location.reload() unconditionally, discarding this tab's
  // unsaved work. The onNeedReload override must hold the reload and prompt when a
  // reload would lose work, and reload only when it wouldn't.
  it('does not reload a claimed tab with work in progress; surfaces the prompt instead', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setWorkInProgress({ draftDirty: true });
    setSwState({ needRefresh: false, updateServiceWorker });

    render(<PwaUpdateBanner />);
    expect(capturedOnNeedReload).toBeTypeOf('function');

    // Another tab accepted the update; this tab receives the controlling event.
    act(() => capturedOnNeedReload?.());

    expect(mockReload).not.toHaveBeenCalled();
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(
      screen.getByText(/new version of Architect is available/i),
    ).toBeInTheDocument();
  });

  it('reloads a claimed tab that has no work to lose', () => {
    vi.useFakeTimers();
    setWorkInProgress();
    setSwState({ needRefresh: false, updateServiceWorker: vi.fn() });

    render(<PwaUpdateBanner />);

    act(() => capturedOnNeedReload?.());

    expect(mockReload).toHaveBeenCalledTimes(1);
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
