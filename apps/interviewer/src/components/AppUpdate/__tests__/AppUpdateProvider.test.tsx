import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function ContextProbe() {
  const { status } = useAppUpdateContext();
  return <span>{status}</span>;
}

describe('AppUpdateProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('attaches a rejection handler to the background update check', async () => {
    // `update()` rejects whenever the sw.js fetch fails, which is routine for
    // an offline-first PWA. Without a handler the rejection escapes and is
    // reported as an uncaught TypeError crash, so assert the provider claims
    // it rather than relying on `void`.
    vi.useFakeTimers();

    try {
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

      const swFetchFailure = new TypeError(
        "Failed to update a ServiceWorker for scope ('https://example.test/') with script ('https://example.test/sw.js'): An unknown error occurred when fetching the script.",
      );
      let rejectionHandled = false;
      // A thenable rather than a real rejected promise: an unclaimed native
      // rejection would leak out of this test as an unhandled rejection.
      const update = vi.fn(() => ({
        catch: (onRejected: (reason: unknown) => unknown) => {
          rejectionHandled = true;
          onRejected(swFetchFailure);
          return Promise.resolve();
        },
        // oxlint-disable-next-line unicorn/no-thenable -- deliberately thenable: this stands in for the promise `update()` returns, and covers a handler attached via `then(undefined, onRejected)` as well as via `catch`
        then: (
          _onFulfilled?: unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
          if (onRejected) {
            rejectionHandled = true;
            onRejected(swFetchFailure);
          }
          return Promise.resolve();
        },
      }));

      act(() => {
        options.onRegisteredSW?.('/sw.js', {
          update,
        } as unknown as ServiceWorkerRegistration);
      });

      act(() => {
        // Mirrors UPDATE_CHECK_INTERVAL_MS in AppUpdateProvider.
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(update).toHaveBeenCalledTimes(1);
      expect(rejectionHandled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives an update() that throws synchronously', () => {
    // Firefox throws `InvalidStateError` out of `update()` itself — not through
    // the returned promise — when the registration has no worker left to
    // update. A promise handler cannot see that, so it escaped the interval
    // callback and was reported as an uncaught DOMException crash. Assert the
    // throw stays inside the callback and the hourly check keeps running.
    vi.useFakeTimers();

    try {
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

      const update = vi.fn(() => {
        throw new DOMException(
          'An attempt was made to use an object that is not, or is no longer, usable',
          'InvalidStateError',
        );
      });

      act(() => {
        options.onRegisteredSW?.('/sw.js', {
          update,
        } as unknown as ServiceWorkerRegistration);
      });

      // Each tick must survive on its own: an escaping throw would surface here
      // as a failed test, and a swallowed one leaves the interval intact.
      expect(() => {
        act(() => {
          // Mirrors UPDATE_CHECK_INTERVAL_MS in AppUpdateProvider.
          vi.advanceTimersByTime(60 * 60 * 1000);
        });
      }).not.toThrow();
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(update).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
