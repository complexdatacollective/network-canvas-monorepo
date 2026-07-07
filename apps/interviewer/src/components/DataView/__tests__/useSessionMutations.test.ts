import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSessionMutations } from '../useSessionMutations';

const markSessionsExported = vi.fn().mockResolvedValue(undefined);
const deleteSessions = vi.fn().mockResolvedValue(undefined);
const getSettings = vi.fn().mockResolvedValue({
  requireUnlockOnExport: false,
  exportGraphML: true,
  exportCSV: false,
  useScreenLayoutCoordinates: false,
  screenLayoutHeight: 0,
  screenLayoutWidth: 0,
});
const runExport = vi.fn();
const shareOrDownloadBlob = vi.fn();
const openDialog = vi.fn();
const toastAdd = vi.fn();

vi.mock('~/lib/db/api', () => ({
  markSessionsExported: (...args: unknown[]) => markSessionsExported(...args),
  deleteSessions: (...args: unknown[]) => deleteSessions(...args),
  getSettings: () => getSettings(),
}));

vi.mock('~/lib/export/exportSessions', () => ({
  runExport: (...args: unknown[]) => runExport(...args),
  buildExportOptions: (args: unknown) => args,
}));

vi.mock('~/lib/files/download', () => ({
  shareOrDownloadBlob: (...args: unknown[]) => shareOrDownloadBlob(...args),
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog }),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ track: vi.fn(), captureException: vi.fn() }),
}));

vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({ requireFreshUnlock: vi.fn() }),
}));

function makeHook() {
  return renderHook(() =>
    useSessionMutations({
      selectedCount: 1,
      resolveSelectedIds: () => Promise.resolve(['s1']),
      clearSelection: vi.fn(),
      onReload: () => Promise.resolve(),
      reloadData: () => Promise.resolve(),
    }),
  );
}

async function buildPendingShare(result: ReturnType<typeof makeHook>['result']) {
  runExport.mockResolvedValue({
    result: {
      successfulExports: [{ sessionId: 's1' }],
      failedExports: [],
    },
    blob: new Blob(['x']),
    fileName: 'export.zip',
  });
  await act(async () => {
    await result.current.handleExport();
  });
  expect(result.current.pendingShare).not.toBeNull();
}

describe('useSessionMutations — Save export marks exported only on a real save', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT mark exported when an unconfirmed download is not confirmed by the researcher', async () => {
    // Object-URL <a download> fallback: the save happened as far as the DOM is
    // concerned, but the browser gives no completion/cancel signal.
    shareOrDownloadBlob.mockResolvedValue({ saved: true, confirmed: false });
    // Researcher answers "Not yet" — the file did not actually download.
    openDialog.mockResolvedValue(false);

    const { result } = makeHook();
    await buildPendingShare(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(markSessionsExported).not.toHaveBeenCalled();
    // pendingShare retained so Save export stays available for a retry.
    expect(result.current.pendingShare).not.toBeNull();
  });

  it('marks exported when the researcher confirms the unconfirmed download saved', async () => {
    shareOrDownloadBlob.mockResolvedValue({ saved: true, confirmed: false });
    openDialog.mockResolvedValue(true);

    const { result } = makeHook();
    await buildPendingShare(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(markSessionsExported).toHaveBeenCalledWith(['s1']);
    expect(result.current.pendingShare).toBeNull();
  });

  it('marks exported without a confirm prompt when the save is confirmed (Web Share)', async () => {
    shareOrDownloadBlob.mockResolvedValue({ saved: true, confirmed: true });

    const { result } = makeHook();
    await buildPendingShare(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(openDialog).not.toHaveBeenCalled();
    expect(markSessionsExported).toHaveBeenCalledWith(['s1']);
    expect(result.current.pendingShare).toBeNull();
  });

  it('does NOT mark exported when the share sheet is cancelled', async () => {
    shareOrDownloadBlob.mockResolvedValue({ saved: false, confirmed: false });

    const { result } = makeHook();
    await buildPendingShare(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(openDialog).not.toHaveBeenCalled();
    expect(markSessionsExported).not.toHaveBeenCalled();
    expect(result.current.pendingShare).not.toBeNull();
  });
});
