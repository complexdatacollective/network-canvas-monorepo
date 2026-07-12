import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { AuthMode } from '~/lib/auth/api';
import type { AuthStateKind } from '~/lib/auth/AuthContext';
import { DEFAULT_SETTINGS } from '~/lib/db/types';
import type { ProtocolWithCounts } from '~/lib/db/types';

const { mockEstimateStorage, mockIsPersisted, mockUseAuth, mockListProtocols } =
  vi.hoisted(() => ({
    mockEstimateStorage: vi.fn(),
    mockIsPersisted: vi.fn(),
    mockUseAuth: vi.fn(),
    mockListProtocols: vi.fn(),
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
  listProtocols: mockListProtocols,
  countSyntheticSessions: vi.fn(async () => 0),
  deleteSyntheticSessions: vi.fn(async () => 0),
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
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

function makeProtocol(name: string, hash: string): ProtocolWithCounts {
  // CurrentProtocol's full shape (stages/codebook cross-references) isn't
  // relevant to SettingsDialog, which only reads name/hash off the wrapper —
  // mirrors the fixture pattern in NewSessionForm.test.tsx.
  const protocol = {
    name,
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  } as unknown as CurrentProtocol;
  return {
    id: hash,
    hash,
    name,
    schemaVersion: 8,
    importedAt: '2026-07-01T00:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

function mockAuth(kind: AuthStateKind, mode?: AuthMode) {
  mockUseAuth.mockReturnValue({
    kind,
    mode,
    idleTimeoutMinutes: 15,
    setIdleTimeoutMinutes: vi.fn(),
  });
}

beforeEach(() => {
  mockAuth('unlocked', 'none');
  mockListProtocols.mockResolvedValue([]);
  mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
  mockIsPersisted.mockResolvedValue(false);
});

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

describe('SettingsDialog Security tab — step-up controls gating', () => {
  // Pins the fix at SettingsDialog.tsx: the gate must be
  // `auth.kind === 'unlocked' && auth.mode !== 'none'`, not just
  // `auth.mode !== 'none'`. An unconfigured vault (`kind: 'unconfigured'`,
  // `mode: undefined`) and an enrolled-but-unsecured vault
  // (`kind: 'unlocked'`, `mode: 'none'`) must both hide the controls; only a
  // secured, unlocked vault (`kind: 'unlocked'`, `mode: 'pin'`) shows them.
  //
  // Also pins the ManageAuthenticator/ResetDeviceRow copy fix: unconfigured
  // and enrolled 'none' both mean "no device lock", so both show the "Device
  // lock" heading and "Reset device" control; only a real secured lock shows
  // "Authenticator" and "Revoke".
  it.each<{
    kind: AuthStateKind;
    mode: AuthMode | undefined;
    visible: boolean;
    heading: string;
    resetLabel: string;
  }>([
    {
      kind: 'unconfigured',
      mode: undefined,
      visible: false,
      heading: 'Device lock',
      resetLabel: 'Reset device',
    },
    {
      kind: 'unlocked',
      mode: 'none',
      visible: false,
      heading: 'Device lock',
      resetLabel: 'Reset device',
    },
    {
      kind: 'unlocked',
      mode: 'pin',
      visible: true,
      heading: 'Authenticator',
      resetLabel: 'Revoke',
    },
  ])(
    'kind=$kind mode=$mode -> step-up visible=$visible, heading=$heading',
    async ({ kind, mode, visible, heading, resetLabel }) => {
      mockAuth(kind, mode);
      const user = userEvent.setup();
      render(<SettingsDialog open onClose={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: 'Security' }));

      // ResetDeviceRow always renders; its label distinguishes no-lock from
      // secured and doubles as a settle point before asserting switch absence.
      expect(
        await screen.findByRole('button', { name: resetLabel }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: heading }),
      ).toBeInTheDocument();

      if (visible) {
        expect(
          screen.getByRole('switch', {
            name: 'Require unlock when entering an interview',
          }),
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole('switch', {
            name: 'Require unlock when entering an interview',
          }),
        ).not.toBeInTheDocument();
      }
    },
  );
});

describe('SettingsDialog synthetic tab — protocol import race', () => {
  it('re-queries protocols when the Synthetic tab is selected, picking up a protocol that finished importing after the dialog opened', async () => {
    const protocol = makeProtocol('Race Protocol', 'hash-1');
    // First call is the dialog's open-effect, simulating a protocol whose
    // saveProtocol() write hasn't landed yet; second call is the tab-select
    // effect, simulating that write completing in the interim.
    mockListProtocols
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([protocol]);

    const user = userEvent.setup();
    render(<SettingsDialog open onClose={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Synthetic data' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Protocol' })).toHaveValue(
        'hash-1',
      );
    });
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });
});
