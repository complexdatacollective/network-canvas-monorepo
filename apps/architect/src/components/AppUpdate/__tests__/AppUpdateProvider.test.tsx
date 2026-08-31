import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(options.onNeedReload?.()).toBeUndefined();
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
