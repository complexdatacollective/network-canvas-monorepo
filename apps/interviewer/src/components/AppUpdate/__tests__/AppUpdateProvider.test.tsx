import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type JsdomVirtualConsole = {
  on: (event: 'jsdomError', listener: (error: Error) => void) => void;
  off: (event: 'jsdomError', listener: (error: Error) => void) => void;
};

const { mockInstallServiceWorkerUpdate, mockUseAppUpdate, mockUseRegisterSW } =
  vi.hoisted(() => ({
    mockInstallServiceWorkerUpdate: vi.fn(),
    mockUseAppUpdate: vi.fn(() => ({
      status: 'idle' as const,
      releaseNotes: null,
      install: vi.fn(),
    })),
    mockUseRegisterSW: vi.fn((_options: unknown) => ({
      needRefresh: [false],
    })),
  }));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

vi.mock('@codaco/fresco-ui/appUpdate/serviceWorkerUpdate', () => ({
  installServiceWorkerUpdate: mockInstallServiceWorkerUpdate,
}));

vi.mock('@codaco/fresco-ui/appUpdate/useAppUpdate', () => ({
  default: mockUseAppUpdate,
}));

import { AppUpdateProvider, useAppUpdateContext } from '../AppUpdateProvider';

// Mirrors UPDATE_CHECK_INTERVAL_MS in the provider (hourly).
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function ContextProbe() {
  const { status } = useAppUpdateContext();
  return <span>{status}</span>;
}

describe('AppUpdateProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps reload ownership out of vite-plugin-pwa', () => {
    render(
      <AppUpdateProvider>
        <ContextProbe />
      </AppUpdateProvider>,
    );

    const options = mockUseRegisterSW.mock.calls[0]?.[0] as {
      onNeedReload?: () => void;
    };
    expect(options.onNeedReload).toBeTypeOf('function');

    // jsdom makes Location.reload non-configurable, so observe its underlying
    // jsdomError event. This fails if the callback attempts a real navigation.
    const virtualConsole = (
      window as unknown as { _virtualConsole?: JsdomVirtualConsole }
    )._virtualConsole;
    expect(virtualConsole).toBeDefined();
    if (!virtualConsole) throw new Error('jsdom virtual console unavailable');
    const navigationError = vi.fn();
    virtualConsole.on('jsdomError', navigationError);
    try {
      options.onNeedReload?.();
    } finally {
      virtualConsole.off('jsdomError', navigationError);
    }
    expect(navigationError).not.toHaveBeenCalled();
    expect(mockInstallServiceWorkerUpdate).not.toHaveBeenCalled();

    expect(mockUseAppUpdate).toHaveBeenCalledWith({
      app: 'interviewer',
      currentVersion: expect.any(String),
      needRefresh: false,
      installUpdate: expect.any(Function),
    });
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  // The hourly check fetches the worker script, so it rejects whenever the
  // device is offline or the network hiccups. Leaving that rejection floating
  // reaches the window as an unhandled error and is reported as a crash.
  it('handles a failed update check instead of leaving it uncaught', () => {
    vi.useFakeTimers();

    const fetchFailure = new TypeError(
      "Failed to update a ServiceWorker for scope ('https://example.test/') " +
        "with script ('https://example.test/sw.js'): An unknown error occurred " +
        'when fetching the script.',
    );

    // Stands in for the promise `update()` returns, recording whether the
    // caller subscribed to its rejection at all.
    let rejectionHandler: ((reason: unknown) => unknown) | undefined;
    const subscribe = (onRejected?: (reason: unknown) => unknown) => {
      rejectionHandler = onRejected;
      return Promise.resolve();
    };
    const update = vi.fn(() => ({
      then: (
        _onFulfilled: unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => subscribe(onRejected),
      catch: (onRejected: (reason: unknown) => unknown) =>
        subscribe(onRejected),
    }));

    render(
      <AppUpdateProvider>
        <ContextProbe />
      </AppUpdateProvider>,
    );

    const options = mockUseRegisterSW.mock.calls[0]?.[0] as {
      onRegisteredSW?: (
        url: string,
        registration: ServiceWorkerRegistration,
      ) => void;
    };
    act(() => {
      options.onRegisteredSW?.('/sw.js', {
        update,
      } as unknown as ServiceWorkerRegistration);
    });

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(rejectionHandler).toBeTypeOf('function');
    expect(() => rejectionHandler?.(fetchFailure)).not.toThrow();
  });
});
