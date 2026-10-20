import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolWithCounts } from '~/lib/db/types';
import type { BundledLegacyInterviewer } from '~/lib/legacyInterviewer';

const mocks = vi.hoisted(() => ({
  bundled: null as BundledLegacyInterviewer | null,
  confirmProtocolUpgrade: vi.fn(),
  chooseImportRoute: vi.fn(),
  showLegacyProtocolInfo: vi.fn(),
  track: vi.fn(),
  openDialog: vi.fn(),
}));

vi.mock('~/lib/legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/legacyInterviewer')>()),
  getBundledLegacyInterviewer: () => mocks.bundled,
}));
vi.mock('~/components/legacyProtocolDialogs', () => ({
  confirmProtocolUpgrade: mocks.confirmProtocolUpgrade,
  chooseImportRoute: mocks.chooseImportRoute,
  showLegacyProtocolInfo: mocks.showLegacyProtocolInfo,
}));
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ track: mocks.track }),
}));
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: mocks.openDialog }),
}));
vi.mock('~/lib/pwa/legacyInterviewerOffline', () => ({
  useLegacyInterviewerOffline: () => 'ready',
}));

const { useLegacyProtocolActions } =
  await import('../useLegacyProtocolActions');

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

const schema8Protocol = {
  id: 'row',
  hash: 'schema-8-hash',
  name: 'Wave One',
  schemaVersion: 8,
  importedAt: '2025-05-20T10:00:00.000Z',
  codebook: {},
  protocol: { name: 'Wave One', schemaVersion: 8, codebook: {}, stages: [] },
  sessionCount: 2,
} as ProtocolWithCounts;

const file = new File(['zip'], 'older.netcanvas');
const migrationRequest = { file, label: 'Older', schemaVersion: 8 };

const setup = () => {
  const startImport = vi.fn();
  const hook = renderHook(() => useLegacyProtocolActions({ startImport }));
  return { ...hook, startImport };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bundled = INTERVIEWER_8;
});

describe('useLegacyProtocolActions: schema 8 cards', () => {
  it('says whether Interviewer 8 is there to run their interviews', () => {
    expect(setup().result.current.schema8).toMatchObject({
      interviewer: INTERVIEWER_8,
      offline: 'ready',
    });
    mocks.bundled = null;
    expect(setup().result.current.schema8.interviewer).toBeNull();
  });

  it('shows a protocol’s details', () => {
    const { result } = setup();
    result.current.schema8.onShowInfo(schema8Protocol);
    expect(mocks.showLegacyProtocolInfo).toHaveBeenCalledWith(
      mocks.openDialog,
      schema8Protocol,
    );
  });

  it('offers no upgrade of a stored protocol: only an import upgrades', () => {
    expect(Object.keys(setup().result.current.schema8).toSorted()).toEqual([
      'interviewer',
      'offline',
      'onShowInfo',
    ]);
  });
});

describe('useLegacyProtocolActions: an older file being imported', () => {
  it('keeps it on schema 8 through the normal import', async () => {
    mocks.chooseImportRoute.mockResolvedValue('keep');
    const { result, startImport } = setup();

    result.current.onMigrationRequired(migrationRequest);

    await waitFor(() =>
      expect(startImport).toHaveBeenCalledWith({
        source: 'file',
        file,
        label: 'Older',
        olderSchema: 'keep',
      }),
    );
    expect(mocks.confirmProtocolUpgrade).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('protocol_kept_on_legacy', {
      schema_version: 8,
    });
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
        olderSchema: 'upgrade',
      }),
    );
    expect(mocks.confirmProtocolUpgrade).toHaveBeenCalledWith(
      mocks.openDialog,
      { fromVersion: 8, legacyInterviewerBundled: true },
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
    await act(async () => {});
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
        expect.objectContaining({ olderSchema: 'upgrade' }),
      ),
    );
    expect(mocks.chooseImportRoute).not.toHaveBeenCalled();
    // The confirmation is told it is the only dialog, so it gives the schema
    // intro and the caution itself (legacyProtocolDialogs.test.tsx pins the
    // words it then shows).
    expect(mocks.confirmProtocolUpgrade).toHaveBeenCalledWith(
      mocks.openDialog,
      { fromVersion: 8, legacyInterviewerBundled: false },
    );
  });
});
