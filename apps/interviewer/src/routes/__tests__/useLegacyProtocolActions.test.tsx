import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';
import type { BundledLegacyInterviewer } from '~/lib/legacyInterviewer';

const mocks = vi.hoisted(() => ({
  bundled: null as BundledLegacyInterviewer | null,
  goToLegacyInterviewer: vi.fn(),
  confirmProtocolUpgrade: vi.fn(),
  chooseImportRoute: vi.fn(),
  showHandoffFailed: vi.fn(),
  showLegacyProtocolInfo: vi.fn(),
  upgradeLegacyProtocol: vi.fn(),
  findUpgradedCopy: vi.fn<() => Promise<string | null>>(),
  keepOnInterviewer8: vi.fn(),
  track: vi.fn(),
  captureException: vi.fn(),
  addToast: vi.fn(),
  openDialog: vi.fn(),
  lockSettled: true,
  settleLock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('~/lib/legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/legacyInterviewer')>()),
  getBundledLegacyInterviewer: () => mocks.bundled,
  goToLegacyInterviewer: mocks.goToLegacyInterviewer,
}));
vi.mock('~/components/legacyProtocolDialogs', () => ({
  confirmProtocolUpgrade: mocks.confirmProtocolUpgrade,
  chooseImportRoute: mocks.chooseImportRoute,
  showHandoffFailed: mocks.showHandoffFailed,
  showLegacyProtocolInfo: mocks.showLegacyProtocolInfo,
}));
vi.mock('~/lib/protocol/upgradeLegacyProtocol', () => ({
  upgradeLegacyProtocol: mocks.upgradeLegacyProtocol,
  findUpgradedCopy: mocks.findUpgradedCopy,
}));
vi.mock('~/lib/protocol/importRouting', () => ({
  keepOnInterviewer8: mocks.keepOnInterviewer8,
}));
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({
    track: mocks.track,
    captureException: mocks.captureException,
  }),
}));
vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: mocks.addToast }),
}));
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: mocks.openDialog }),
}));
vi.mock('~/components/useSettleLockForInterviewer8', () => ({
  useSettleLockForInterviewer8: () => ({
    settled: mocks.lockSettled,
    settleLock: mocks.settleLock,
  }),
}));
vi.mock('~/lib/pwa/legacyInterviewerOffline', () => ({
  useLegacyInterviewerOffline: () => 'ready',
}));

const { useLegacyProtocolActions } =
  await import('../useLegacyProtocolActions');

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

const legacyProtocol: LegacyProtocolSummary = {
  id: 'row',
  hash: 'legacy-hash',
  name: 'Wave One',
  schemaVersion: 8,
  importedAt: '2025-05-20T10:00:00.000Z',
  sessionCount: 2,
};

const file = new File(['zip'], 'older.netcanvas');
const migrationRequest = { file, label: 'Older', schemaVersion: 8 };

const setup = () => {
  const reload = vi.fn(() => Promise.resolve());
  const startImport = vi.fn();
  const hook = renderHook(() =>
    useLegacyProtocolActions({ reload, startImport }),
  );
  return { ...hook, reload, startImport };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bundled = INTERVIEWER_8;
  mocks.lockSettled = true;
  mocks.settleLock.mockResolvedValue(true);
  mocks.findUpgradedCopy.mockResolvedValue(null);
});

describe('useLegacyProtocolActions: schema 8 cards', () => {
  it('starts an interview in Interviewer 8 by full page load', async () => {
    const { result } = setup();
    result.current.legacy.onStart(legacyProtocol);
    await waitFor(() =>
      expect(mocks.goToLegacyInterviewer).toHaveBeenCalledWith(
        '/v8/?start=legacy-hash',
      ),
    );
    expect(mocks.settleLock).toHaveBeenCalledOnce();
  });

  it.each([
    ['starting an interview', 'onStart'],
    ['opening Interviewer 8', 'onOpenInInterviewer'],
  ] as const)(
    'stays here when %s while the researcher leaves lock set-up',
    async (_, action) => {
      // Interviewer 8 cannot set the shared lock up and sends an unconfigured
      // device straight back, so nothing opens until it is settled here.
      mocks.settleLock.mockResolvedValue(false);
      const { result } = setup();
      result.current.legacy[action](legacyProtocol);
      await waitFor(() => expect(mocks.settleLock).toHaveBeenCalledOnce());
      await act(async () => {});
      expect(mocks.goToLegacyInterviewer).not.toHaveBeenCalled();
    },
  );

  it('opens Interviewer 8’s data view once the lock is settled', async () => {
    const { result } = setup();
    result.current.onOpenLegacyData?.();
    await waitFor(() =>
      expect(mocks.goToLegacyInterviewer).toHaveBeenCalledWith('/v8/data'),
    );

    vi.clearAllMocks();
    mocks.settleLock.mockResolvedValue(false);
    result.current.onOpenLegacyData?.();
    await waitFor(() => expect(mocks.settleLock).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(mocks.goToLegacyInterviewer).not.toHaveBeenCalled();
  });

  it('links the interview count to Interviewer 8 only once a lock is in place', () => {
    expect(setup().result.current.legacy.sessionsHref).toBe('/v8/data');
    mocks.lockSettled = false;
    expect(setup().result.current.legacy.sessionsHref).toBeNull();
  });

  it('goes nowhere without a bundled Interviewer 8', () => {
    mocks.bundled = null;
    const { result } = setup();
    expect(result.current.legacy.interviewer).toBeNull();
    expect(result.current.onOpenLegacyData).toBeNull();
    expect(result.current.legacy.sessionsHref).toBeNull();
    result.current.legacy.onStart(legacyProtocol);
    result.current.legacy.onOpenInInterviewer(legacyProtocol);
    expect(mocks.goToLegacyInterviewer).not.toHaveBeenCalled();
  });

  it('upgrades only after confirmation', async () => {
    mocks.confirmProtocolUpgrade.mockResolvedValue(false);
    const { result } = setup();
    result.current.legacy.onUpgrade(legacyProtocol);
    await waitFor(() =>
      expect(mocks.confirmProtocolUpgrade).toHaveBeenCalledWith(
        mocks.openDialog,
        { fromVersion: 8, source: 'legacy-library' },
      ),
    );
    expect(mocks.upgradeLegacyProtocol).not.toHaveBeenCalled();
  });

  it('brings the new copy into view after an upgrade, with level-1 analytics only', async () => {
    mocks.confirmProtocolUpgrade.mockResolvedValue(true);
    mocks.upgradeLegacyProtocol.mockResolvedValue({
      status: 'upgraded',
      hash: 'new-hash',
      protocol: { name: 'Wave One' },
    });
    const { result, reload } = setup();

    await act(async () => {
      result.current.legacy.onUpgrade(legacyProtocol);
    });

    await waitFor(() =>
      expect(result.current.focusRequest).toEqual({ protocolHash: 'new-hash' }),
    );
    expect(mocks.upgradeLegacyProtocol).toHaveBeenCalledWith('legacy-hash');
    expect(reload).toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('legacy_protocol_upgraded', {
      from_schema: 8,
      to_schema: 9,
      existing: false,
    });
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('shows the existing copy when the protocol was upgraded before', async () => {
    mocks.confirmProtocolUpgrade.mockResolvedValue(true);
    mocks.upgradeLegacyProtocol.mockResolvedValue({
      status: 'existing',
      hash: 'earlier-hash',
    });
    const { result } = setup();

    await act(async () => {
      result.current.legacy.onUpgrade(legacyProtocol);
    });

    await waitFor(() =>
      expect(result.current.focusRequest).toEqual({
        protocolHash: 'earlier-hash',
      }),
    );
  });

  it('shows an upgraded copy that is still here without asking to make one', async () => {
    // The confirmation promises a new copy; none is made.
    mocks.findUpgradedCopy.mockResolvedValue('earlier-hash');
    const { result } = setup();

    await act(async () => {
      result.current.legacy.onUpgrade(legacyProtocol);
    });

    await waitFor(() =>
      expect(result.current.focusRequest).toEqual({
        protocolHash: 'earlier-hash',
      }),
    );
    expect(mocks.findUpgradedCopy).toHaveBeenCalledWith('legacy-hash');
    expect(mocks.confirmProtocolUpgrade).not.toHaveBeenCalled();
    expect(mocks.upgradeLegacyProtocol).not.toHaveBeenCalled();
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'info' }),
    );
    expect(mocks.track).toHaveBeenCalledWith('legacy_protocol_upgraded', {
      from_schema: 8,
      to_schema: 9,
      existing: true,
    });
  });

  it('asks to confirm when it cannot tell whether a copy exists', async () => {
    mocks.findUpgradedCopy.mockRejectedValue(new Error('storage'));
    mocks.confirmProtocolUpgrade.mockResolvedValue(false);
    const { result } = setup();

    await act(async () => {
      result.current.legacy.onUpgrade(legacyProtocol);
    });

    await waitFor(() =>
      expect(mocks.confirmProtocolUpgrade).toHaveBeenCalledOnce(),
    );
    expect(mocks.upgradeLegacyProtocol).not.toHaveBeenCalled();
  });

  it('reports a failed upgrade and focuses nothing', async () => {
    mocks.confirmProtocolUpgrade.mockResolvedValue(true);
    mocks.upgradeLegacyProtocol.mockResolvedValue({
      status: 'failed',
      reason: 'read-failed',
    });
    const { result } = setup();

    await act(async () => {
      result.current.legacy.onUpgrade(legacyProtocol);
    });

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      ),
    );
    expect(result.current.focusRequest).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith('legacy_protocol_upgrade_failed', {
      reason: 'read-failed',
    });
  });
});

describe('useLegacyProtocolActions: an older file being imported', () => {
  it('keeps it on schema 8 by handing it to Interviewer 8', async () => {
    mocks.chooseImportRoute.mockResolvedValue('keep');
    mocks.keepOnInterviewer8.mockResolvedValue({ ok: true });
    const { result, startImport } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() =>
      expect(mocks.keepOnInterviewer8).toHaveBeenCalledWith(
        file,
        INTERVIEWER_8,
      ),
    );
    expect(startImport).not.toHaveBeenCalled();
    expect(mocks.showHandoffFailed).not.toHaveBeenCalled();
  });

  it('stages nothing until the lock is settled', async () => {
    // A file staged for an Interviewer 8 that sends the researcher straight
    // back would be lost.
    mocks.chooseImportRoute.mockResolvedValue('keep');
    mocks.settleLock.mockResolvedValue(false);
    const { result } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() => expect(mocks.settleLock).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(mocks.keepOnInterviewer8).not.toHaveBeenCalled();
  });

  it('shows an error when the file cannot be handed over', async () => {
    mocks.chooseImportRoute.mockResolvedValue('keep');
    mocks.keepOnInterviewer8.mockResolvedValue({
      ok: false,
      error: new Error('quota'),
    });
    const { result } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() =>
      expect(mocks.showHandoffFailed).toHaveBeenCalledWith(mocks.openDialog),
    );
  });

  it('upgrades it, after the migration notes, through the normal import', async () => {
    mocks.chooseImportRoute.mockResolvedValue('upgrade');
    mocks.confirmProtocolUpgrade.mockResolvedValue(true);
    const { result, startImport } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() =>
      expect(startImport).toHaveBeenCalledWith({
        source: 'file',
        file,
        label: 'Older',
        allowMigration: true,
      }),
    );
    expect(mocks.confirmProtocolUpgrade).toHaveBeenCalledWith(
      mocks.openDialog,
      { fromVersion: 8, source: 'file' },
    );
  });

  it('imports nothing when the upgrade notes are not confirmed', async () => {
    mocks.chooseImportRoute.mockResolvedValue('upgrade');
    mocks.confirmProtocolUpgrade.mockResolvedValue(false);
    const { result, startImport } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() =>
      expect(mocks.confirmProtocolUpgrade).toHaveBeenCalled(),
    );
    expect(startImport).not.toHaveBeenCalled();
  });

  it('does nothing on Cancel', async () => {
    mocks.chooseImportRoute.mockResolvedValue(null);
    const { result, startImport } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() => expect(mocks.chooseImportRoute).toHaveBeenCalled());
    expect(mocks.keepOnInterviewer8).not.toHaveBeenCalled();
    expect(mocks.confirmProtocolUpgrade).not.toHaveBeenCalled();
    expect(startImport).not.toHaveBeenCalled();
  });

  it('offers only the upgrade without a bundled Interviewer 8', async () => {
    mocks.bundled = null;
    mocks.confirmProtocolUpgrade.mockResolvedValue(true);
    const { result, startImport } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() =>
      expect(startImport).toHaveBeenCalledWith(
        expect.objectContaining({ allowMigration: true }),
      ),
    );
    expect(mocks.chooseImportRoute).not.toHaveBeenCalled();
    expect(mocks.keepOnInterviewer8).not.toHaveBeenCalled();
  });
});
