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
import { renderedMessage } from '~/testUtils/renderedMessage';

// `@codaco/fresco-ui/Toast`'s `ToastData` isn't exported, so this mirrors
// only the fields these tests assert on from `toast.add()`'s argument.
type ToastAddCall = {
  title: string;
  description?: string | ReactNode;
  variant?: string;
  timeout?: number;
};

// `useDialog()`'s real `confirm()` accepts a much larger `ConfirmOptions`
// (title/description/intent/etc.), but these tests only ever need to drive
// `onConfirm` itself.
type ConfirmCall = {
  onConfirm: () => Promise<void> | void;
};

const {
  mockEstimateStorage,
  mockIsPersisted,
  mockUseAuth,
  mockListProtocols,
  mockOpenSetupWizard,
  mockGenerateSyntheticSessions,
  mockToastAdd,
  mockUnstableToastAdd,
  mockCountSyntheticSessions,
  mockDeleteSyntheticSessions,
  mockConfirm,
} = vi.hoisted(() => ({
  mockEstimateStorage: vi.fn(),
  mockIsPersisted: vi.fn(),
  mockUseAuth: vi.fn(),
  mockListProtocols: vi.fn(),
  mockOpenSetupWizard: vi.fn(),
  mockGenerateSyntheticSessions: vi.fn(),
  mockToastAdd: vi.fn<(data: ToastAddCall) => string>(),
  mockUnstableToastAdd: { current: false },
  mockCountSyntheticSessions: vi.fn<() => Promise<number>>(),
  mockDeleteSyntheticSessions: vi.fn<() => Promise<number>>(),
  mockConfirm: vi.fn<(options: ConfirmCall) => Promise<boolean | null>>(),
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
  countSyntheticSessions: mockCountSyntheticSessions,
  deleteSyntheticSessions: mockDeleteSyntheticSessions,
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
  useToast: () => ({
    add: mockUnstableToastAdd.current ? mockToastAdd.bind(null) : mockToastAdd,
  }),
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: mockConfirm }),
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
  mockUnstableToastAdd.current = false;
  mockAuth('unlocked', 'none');
  mockListProtocols.mockResolvedValue([]);
  mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
  mockIsPersisted.mockResolvedValue(false);
  mockCountSyntheticSessions.mockResolvedValue(0);
  mockDeleteSyntheticSessions.mockResolvedValue(0);
  // Mirrors the real DialogProvider.handleConfirm just enough for these
  // tests: it runs onConfirm and swallows a rejection rather than letting it
  // reach handleDeleteSynthetic's `await confirm(...)` — the real provider
  // catches it internally too (showing it inline in the dialog and keeping
  // the dialog open for a retry), it never re-throws to the caller.
  mockConfirm.mockImplementation(async ({ onConfirm }: ConfirmCall) => {
    try {
      await onConfirm();
      return true;
    } catch {
      return null;
    }
  });
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

  it('reports an initial synthetic-data refresh failure instead of leaving an unhandled rejection', async () => {
    mockListProtocols.mockRejectedValueOnce(
      new Error('the database connection was closed'),
    );

    render(<SettingsDialog open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: renderedMessage('Could not refresh synthetic session info'),
          description: renderedMessage(
            'The protocol list and session count above may not match what is actually stored on this device. Reopen Settings to refresh them.',
          ),
          variant: 'destructive',
          timeout: 0,
        }),
      ),
    );
  });

  it('does not restart the refresh when the toast callback changes identity', async () => {
    mockUnstableToastAdd.current = true;
    const neverProtocols = new Promise<ProtocolWithCounts[]>(() => {});
    const neverCount = new Promise<number>(() => {});
    mockListProtocols.mockReturnValue(neverProtocols);
    mockCountSyntheticSessions.mockReturnValue(neverCount);
    const onClose = vi.fn();

    const { rerender } = render(
      <SettingsDialog open={false} onClose={onClose} />,
    );
    rerender(<SettingsDialog open onClose={onClose} />);

    await waitFor(() => expect(mockListProtocols).toHaveBeenCalledTimes(1));

    rerender(<SettingsDialog open onClose={onClose} />);
    expect(mockListProtocols).toHaveBeenCalledTimes(1);
  });
});

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

describe('SettingsDialog synthetic tab — generation failure toast', () => {
  it('shows a plain failure and keeps it on screen until dismissed', async () => {
    mockGenerateSyntheticSessions.mockRejectedValueOnce(
      new Error('Protocol not found for hash "hash-1".'),
    );

    await generateWithSelectedProtocol();

    await waitFor(() => expect(mockToastAdd).toHaveBeenCalled());
    expect(mockToastAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: renderedMessage('Generation failed'),
        description: renderedMessage(
          'Synthetic data could not be generated. Please try again.',
        ),
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
        reasonCode: 'insufficientUniqueValues',
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
        /review the conflicting rules below and adjust the protocol in Architect/i,
      ),
    ).toBeInTheDocument();
    // `listitem` doesn't compute an accessible name from its content (ARIA
    // "name from content" is prohibited for this role), so assert on the
    // rendered <li> by its text content instead of an accessible-name query.
    const conflictItem = screen.getByText(
      /Node "Person", Band \(Unique value\): Too few distinct values are available/,
    );
    expect(conflictItem.tagName).toBe('LI');
    // Bounding and scrolling long content is fresco-ui Toast's job, not this
    // component's: `Toast.Description` caps and scrolls internally so an
    // unbounded list can't carry the toast's own title and Close control off
    // the top of the screen. GenerationFailureDescription.stories.tsx and
    // fresco-ui's own Toast.stories.tsx measure that geometry for real; jsdom
    // (rendering `description` outside any `Toast`, as above) has no layout to
    // assert against.
  });
});

describe('SettingsDialog synthetic tab — count after a failed generation', () => {
  it('re-reads the stored count when generation fails, instead of showing a stale one', async () => {
    // Generation refused part-way through. `generateSyntheticSessions` rolls
    // its own rows back, but the dialog can't assume that: it has to re-read
    // storage, so whatever survived is what the researcher sees.
    let storedCount = 0;
    mockCountSyntheticSessions.mockImplementation(async () => storedCount);
    mockGenerateSyntheticSessions.mockImplementation(async () => {
      storedCount = 4;
      throw new Error('the draw exhausted every remaining distinct value');
    });

    await generateWithSelectedProtocol();

    expect(
      await screen.findByText(/currently 4 synthetic sessions/),
    ).toBeInTheDocument();
  });

  it('tells the host to refresh its session list after a failed generation', async () => {
    mockGenerateSyntheticSessions.mockRejectedValueOnce(
      new Error('the draw exhausted every remaining distinct value'),
    );
    const onDataChange = vi.fn();

    mockListProtocols.mockResolvedValue([makeProtocol('Protocol A', 'hash-1')]);
    const user = userEvent.setup();
    render(
      <SettingsDialog open onClose={vi.fn()} onDataChange={onDataChange} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Synthetic data' }));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Protocol' })).toHaveValue(
        'hash-1',
      );
    });
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(onDataChange).toHaveBeenCalled());
  });

  it('still refreshes the count after a successful generation', async () => {
    let storedCount = 0;
    mockCountSyntheticSessions.mockImplementation(async () => storedCount);
    mockGenerateSyntheticSessions.mockImplementation(async () => {
      storedCount = 10;
      return 10;
    });

    await generateWithSelectedProtocol();

    expect(
      await screen.findByText(/currently 10 synthetic sessions/),
    ).toBeInTheDocument();
  });
});

describe('SettingsDialog synthetic tab — post-generation refresh failure', () => {
  it('tells the researcher the screen may be stale, still refreshes the host, and re-enables Generate, when the post-generation refresh rejects', async () => {
    // The dialog's own open-effect and Synthetic-tab-select effect both call
    // reloadSynthetic() before Generate is ever clicked (see the "protocol
    // import race" describe block above) — only the *third* call, made from
    // handleGenerate's finally block, is the one under test here.
    let call = 0;
    mockCountSyntheticSessions.mockImplementation(async () => {
      call += 1;
      if (call >= 3) {
        throw new Error('the database connection was closed');
      }
      return 0;
    });
    mockGenerateSyntheticSessions.mockResolvedValueOnce(5);
    const onDataChange = vi.fn();
    mockListProtocols.mockResolvedValue([makeProtocol('Protocol A', 'hash-1')]);

    const user = userEvent.setup();
    render(
      <SettingsDialog open onClose={vi.fn()} onDataChange={onDataChange} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Synthetic data' }));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Protocol' })).toHaveValue(
        'hash-1',
      );
    });

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    // Generation itself succeeded and sessions were written...
    await waitFor(() =>
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: renderedMessage('Generated 5 synthetic sessions'),
          variant: 'success',
        }),
      ),
    );

    // ...but the post-generation refresh failed. The researcher must be told
    // this screen's list/count can now be stale, not left looking at silently
    // outdated numbers.
    await waitFor(() =>
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: renderedMessage('Could not refresh synthetic session info'),
          variant: 'destructive',
          timeout: 0,
        }),
      ),
    );

    // The host is still told data changed even though this dialog's own
    // refresh failed — the sessions were written to the database regardless.
    expect(onDataChange).toHaveBeenCalled();

    // The refresh failure must not leave Generate stuck disabled/spinning.
    expect(
      await screen.findByRole('button', { name: 'Generate' }),
    ).toBeEnabled();
  });
});

describe('SettingsDialog synthetic tab — delete failure', () => {
  it('does not report a false success, and still unwinds and notifies the host, when the delete itself fails', async () => {
    mockCountSyntheticSessions.mockResolvedValue(5);
    mockDeleteSyntheticSessions.mockRejectedValueOnce(
      new Error('the database connection was closed'),
    );
    const onDataChange = vi.fn();

    const user = userEvent.setup();
    render(
      <SettingsDialog open onClose={vi.fn()} onDataChange={onDataChange} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Synthetic data' }));

    const deleteButton = await screen.findByRole('button', {
      name: 'Delete All',
    });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    await user.click(deleteButton);

    await waitFor(() => expect(mockDeleteSyntheticSessions).toHaveBeenCalled());

    // The failed delete is left to this dialog's own built-in async-confirm
    // error handling (DialogProvider shows it inline on the confirm dialog
    // and keeps it open for a retry — see the comment in
    // handleDeleteSynthetic) rather than a second, competing toast. What
    // SettingsDialog itself must never do is claim a success that didn't
    // happen.
    expect(mockToastAdd).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/^Deleted/) }),
    );

    // The host is still told to refresh — a delete that throws partway
    // through may still have removed some rows, so the host's own view
    // shouldn't be left stale either.
    expect(onDataChange).toHaveBeenCalled();

    // isDeleting must unwind even though the delete failed.
    expect(
      await screen.findByRole('button', { name: 'Delete All' }),
    ).toBeEnabled();
  });

  it('tells the researcher the screen may be stale, still refreshes the host, and re-enables Delete All, when the post-delete refresh rejects', async () => {
    // Same call-count reasoning as the generate-refresh-failure test above:
    // the dialog's open-effect and Synthetic-tab-select effect both call
    // reloadSynthetic() before Delete All is ever clicked, so only the
    // *third* call — made from handleDeleteSynthetic's finally block — is the
    // one under test here.
    let call = 0;
    mockCountSyntheticSessions.mockImplementation(async () => {
      call += 1;
      if (call >= 3) {
        throw new Error('the database connection was closed');
      }
      return 5;
    });
    mockDeleteSyntheticSessions.mockResolvedValueOnce(5);
    const onDataChange = vi.fn();

    const user = userEvent.setup();
    render(
      <SettingsDialog open onClose={vi.fn()} onDataChange={onDataChange} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Synthetic data' }));

    const deleteButton = await screen.findByRole('button', {
      name: 'Delete All',
    });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    await user.click(deleteButton);

    // The delete itself succeeded and sessions were removed...
    await waitFor(() =>
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: renderedMessage('Deleted 5 synthetic sessions'),
          variant: 'success',
        }),
      ),
    );

    // ...but the post-delete refresh failed. This must be reported as its
    // own failure, not attributed back to the delete (which succeeded, and
    // already has its own success toast above) — see the comment in
    // handleDeleteSynthetic explaining why that distinction matters for this
    // dialog's built-in confirm/retry handling.
    await waitFor(() =>
      expect(mockToastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: renderedMessage('Could not refresh synthetic session info'),
          variant: 'destructive',
          timeout: 0,
        }),
      ),
    );

    // The host is still told data changed even though this dialog's own
    // refresh failed — the sessions were deleted from the database
    // regardless.
    expect(onDataChange).toHaveBeenCalled();

    // The refresh failure must not leave Delete All stuck disabled/spinning.
    expect(
      await screen.findByRole('button', { name: 'Delete All' }),
    ).toBeEnabled();
  });
});
