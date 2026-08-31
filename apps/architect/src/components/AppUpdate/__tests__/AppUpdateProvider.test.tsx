import { render, screen } from '@testing-library/react';
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
      app: 'architect',
      currentVersion: expect.any(String),
      needRefresh: false,
      installUpdate: expect.any(Function),
    });
    expect(screen.getByText('idle')).toBeInTheDocument();
  });
});
