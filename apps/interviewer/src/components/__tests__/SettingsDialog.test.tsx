import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '~/lib/db/types';

const { mockEstimateStorage, mockIsPersisted } = vi.hoisted(() => ({
  mockEstimateStorage: vi.fn(),
  mockIsPersisted: vi.fn(),
}));

vi.mock('~/lib/storage', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/storage')>('~/lib/storage');
  return {
    ...actual,
    estimateStorage: mockEstimateStorage,
    isStoragePersisted: mockIsPersisted,
  };
});

vi.mock('~/lib/db/api', () => ({
  getSettings: vi.fn(async () => DEFAULT_SETTINGS),
  updateSettings: vi.fn(async () => DEFAULT_SETTINGS),
  listProtocols: vi.fn(async () => []),
  countSyntheticSessions: vi.fn(async () => 0),
  deleteSyntheticSessions: vi.fn(async () => 0),
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    mode: 'none',
    idleTimeoutMinutes: 15,
    setIdleTimeoutMinutes: vi.fn(),
  }),
}));

vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({
    enabled: false,
    client: null,
    setEnabled: vi.fn(),
    track: vi.fn(),
    captureException: vi.fn(),
  }),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: vi.fn() }),
}));

import { SettingsDialog } from '../SettingsDialog';

afterEach(() => {
  vi.clearAllMocks();
});

describe('SettingsDialog storage durability', () => {
  it('shows the persisted-storage state and usage in the About section', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 1024 * 1024,
      quota: 100 * 1024 * 1024,
      percent: 1,
    });
    mockIsPersisted.mockResolvedValue(true);

    render(<SettingsDialog open onClose={vi.fn()} />);

    // The About section only renders once `reload()`'s Promise.all resolves;
    // under CI runner load that can outrun testing-library's 1s default.
    await waitFor(
      () =>
        expect(screen.getAllByText(/offline storage/i).length).toBeGreaterThan(
          0,
        ),
      { timeout: 5000 },
    );
    expect(screen.getByText(/protected from eviction/i)).toBeInTheDocument();
  });

  it('warns when storage is best-effort (not persisted)', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(false);

    render(<SettingsDialog open onClose={vi.fn()} />);

    await waitFor(
      () =>
        expect(screen.getAllByText(/best-effort/i).length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
  });
});
