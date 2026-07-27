import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ConstraintConflict,
  SyntheticDataConstraintError,
} from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { AuthMode } from '~/lib/auth/api';
import type { AuthStateKind } from '~/lib/auth/AuthContext';
import { DEFAULT_SETTINGS } from '~/lib/db/types';
import type { ProtocolWithCounts } from '~/lib/db/types';

// `@codaco/fresco-ui/Toast`'s `ToastData` isn't exported, so this mirrors
// only the fields these tests assert on from `toast.add()`'s argument.
type ToastAddCall = {
  title: string;
  description?: string | ReactNode;
  variant?: string;
  timeout?: number;
};

const {
  mockEstimateStorage,
  mockIsPersisted,
  mockUseAuth,
  mockListProtocols,
  mockOpenSetupWizard,
  mockGenerateSyntheticSessions,
  mockToastAdd,
} = vi.hoisted(() => ({
  mockEstimateStorage: vi.fn(),
  mockIsPersisted: vi.fn(),
  mockUseAuth: vi.fn(),
  mockListProtocols: vi.fn(),
  mockOpenSetupWizard: vi.fn(),
  mockGenerateSyntheticSessions: vi.fn(),
  mockToastAdd: vi.fn<(data: ToastAddCall) => string>(),
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

vi.mock('~/components/SetupWizardDialog', () => ({
  useSetupWizard: () => ({ openSetupWizard: mockOpenSetupWizard }),
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
  useToast: () => ({ add: mockToastAdd }),
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: vi.fn() }),
}));

vi.mock('~/lib/synthetic/generate', () => ({
  generateSyntheticSessions: mockGenerateSyntheticSessions,
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

  it('opens the Get started wizard from an unconfigured Security tab', async () => {
    mockAuth('unconfigured');
    mockOpenSetupWizard.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SettingsDialog open onClose={onClose} />);

    await user.click(screen.getByRole('tab', { name: 'Security' }));

    expect(
      await screen.findByText(
        /Use the Get started wizard below to enable app security/i,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Get started' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(mockOpenSetupWizard).toHaveBeenCalledOnce();
  });

  it('does not offer the Get started wizard when a lock is configured', async () => {
    mockAuth('unlocked', 'pin');
    const user = userEvent.setup();
    render(<SettingsDialog open onClose={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'Security' }));

    await screen.findByRole('heading', { name: 'Authenticator' });
    expect(
      screen.queryByRole('button', { name: 'Get started' }),
    ).not.toBeInTheDocument();
  });
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

describe('SettingsDialog synthetic tab — generation failure toast', () => {
  async function generateWithSelectedProtocol() {
    mockListProtocols.mockResolvedValue([makeProtocol('Protocol A', 'hash-1')]);
    const user = userEvent.setup();
    render(<SettingsDialog open onClose={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Synthetic data' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Protocol' })).toHaveValue(
        'hash-1',
      );
    });
    await user.click(screen.getByRole('button', { name: 'Generate' }));
  }

  it('shows a plain failure and keeps it on screen until dismissed', async () => {
    mockGenerateSyntheticSessions.mockRejectedValueOnce(
      new Error('Protocol not found for hash "hash-1".'),
    );

    await generateWithSelectedProtocol();

    await waitFor(() => expect(mockToastAdd).toHaveBeenCalled());
    expect(mockToastAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Generation failed',
        description: 'Protocol not found for hash "hash-1".',
        variant: 'destructive',
        timeout: 0,
      }),
    );
  });

  it('renders a refused generation as a readable list of conflicts, kept on screen until dismissed', async () => {
    const conflicts: ConstraintConflict[] = [
      {
        entity: 'node',
        entityType: 'person',
        entityTypeName: 'Person',
        variableIds: ['band-var'],
        variableNames: ['Band'],
        rules: ['unique'],
        reason:
          'only 2 distinct values are possible, but up to 5 nodes of this type can be generated',
      },
    ];
    mockGenerateSyntheticSessions.mockRejectedValueOnce(
      new SyntheticDataConstraintError(
        conflicts,
        'this protocol declares validation rules that cannot all be satisfied together',
      ),
    );

    await generateWithSelectedProtocol();

    await waitFor(() => expect(mockToastAdd).toHaveBeenCalled());
    const call = mockToastAdd.mock.calls.at(-1)?.[0];
    expect(call?.variant).toBe('destructive');
    expect(call?.timeout).toBe(0);

    // The description is a React node, not the pre-formatted string, so
    // render it to confirm each conflict became its own list item.
    render(<>{call?.description}</>);
    expect(
      screen.getByText(
        /this protocol declares validation rules that cannot all be satisfied together/i,
      ),
    ).toBeInTheDocument();
    // `listitem` doesn't compute an accessible name from its content (ARIA
    // "name from content" is prohibited for this role), so assert on the
    // rendered <li> by its text content instead of an accessible-name query.
    const conflictItem = screen.getByText(
      /node "Person", "Band" \(unique\): only 2 distinct values are possible/,
    );
    expect(conflictItem.tagName).toBe('LI');
  });
});
