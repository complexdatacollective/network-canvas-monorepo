import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthStateKind } from '~/lib/auth/AuthContext';

const mocks = vi.hoisted(() => ({
  kind: 'unconfigured' as AuthStateKind,
  refresh: vi.fn(() => Promise.resolve()),
  openSetupWizard: vi.fn(() => Promise.resolve()),
  useSetupWizard: vi.fn(),
  status: vi.fn<() => Promise<{ configured: boolean }>>(),
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({ kind: mocks.kind, refresh: mocks.refresh }),
}));
vi.mock('~/lib/auth/api', () => ({ status: mocks.status }));
vi.mock('../SetupWizardDialog', () => ({
  useSetupWizard: (options: unknown) => {
    mocks.useSetupWizard(options);
    return { openSetupWizard: mocks.openSetupWizard };
  },
}));

const { useSettleLockForInterviewer8 } =
  await import('../useSettleLockForInterviewer8');

const settle = () =>
  renderHook(() => useSettleLockForInterviewer8()).result.current;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.kind = 'unconfigured';
  mocks.status.mockResolvedValue({ configured: false });
});

describe('useSettleLockForInterviewer8', () => {
  it.each(['unlocked', 'locked'] as const)(
    'goes at once when the device is %s',
    async (kind) => {
      mocks.kind = kind;
      const { settled, settleLock } = settle();
      expect(settled).toBe(true);
      await expect(settleLock()).resolves.toBe(true);
      expect(mocks.openSetupWizard).not.toHaveBeenCalled();
    },
  );

  it('opens set-up first on a device with no lock, keeping its data', async () => {
    mocks.status.mockResolvedValue({ configured: true });
    const { settled, settleLock } = settle();
    expect(settled).toBe(false);

    await expect(settleLock()).resolves.toBe(true);
    expect(mocks.useSetupWizard).toHaveBeenCalledWith({
      preserveExistingData: true,
    });
    expect(mocks.openSetupWizard).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('stays when the researcher leaves set-up without choosing', async () => {
    await expect(settle().settleLock()).resolves.toBe(false);
    expect(mocks.openSetupWizard).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('stays when the lock cannot be read afterwards', async () => {
    mocks.status.mockRejectedValue(new Error('storage'));
    await expect(settle().settleLock()).resolves.toBe(false);
  });
});
