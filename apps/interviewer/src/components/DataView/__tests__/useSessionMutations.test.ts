import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { useSessionMutations } from '../useSessionMutations';

const markSessionsExported = vi.fn().mockResolvedValue(undefined);
const markSessionUnfinished = vi.fn().mockResolvedValue(undefined);
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
const saveBlob = vi.fn();
const openDialog = vi.fn();
const toastAdd = vi.fn();

vi.mock('~/lib/db/api', () => ({
  markSessionsExported: (...args: unknown[]) => markSessionsExported(...args),
  markSessionUnfinished: (...args: unknown[]) => markSessionUnfinished(...args),
  deleteSessions: (...args: unknown[]) => deleteSessions(...args),
  getSettings: () => getSettings(),
}));

vi.mock('~/lib/export/exportSessions', () => ({
  runExport: (...args: unknown[]) => runExport(...args),
  buildExportOptions: (args: unknown) => args,
}));

vi.mock('~/lib/files/download', () => ({
  saveBlob: (...args: unknown[]) => saveBlob(...args),
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

async function buildPendingShare(
  result: ReturnType<typeof makeHook>['result'],
) {
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

describe('useSessionMutations — Save export marks exported from the save outcome alone', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marks exported when the save succeeds, with no confirmation prompt', async () => {
    saveBlob.mockResolvedValue({ saved: true });

    const { result } = makeHook();
    await buildPendingShare(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(openDialog).not.toHaveBeenCalled();
    expect(markSessionsExported).toHaveBeenCalledWith(['s1']);
    expect(result.current.pendingShare).toBeNull();
  });

  it('does NOT mark exported when the save is cancelled, and keeps the archive for a retry', async () => {
    saveBlob.mockResolvedValue({ saved: false });

    const { result } = makeHook();
    await buildPendingShare(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(openDialog).not.toHaveBeenCalled();
    expect(markSessionsExported).not.toHaveBeenCalled();
    // pendingShare retained so Save export stays available for a retry.
    expect(result.current.pendingShare).not.toBeNull();
  });

  it('does NOT mark exported when the save throws, and keeps the archive for a retry', async () => {
    saveBlob.mockRejectedValue(new Error('QuotaExceededError'));

    const { result } = makeHook();
    await buildPendingShare(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(markSessionsExported).not.toHaveBeenCalled();
    expect(result.current.pendingShare).not.toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Export failed' }),
    );
  });
});

describe('useSessionMutations — mark unfinished', () => {
  const stages: CurrentProtocol['stages'] = [];

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('changes completion state after confirmation', async () => {
    openDialog.mockResolvedValue(true);
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleMarkUnfinished(
        {
          id: 's1',
          caseId: 'case-1',
        },
        stages,
      );
    });

    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Mark unfinished?',
      }),
    );
    expect(markSessionUnfinished).toHaveBeenCalledWith('s1', stages);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Interview marked unfinished' }),
    );
  });

  it('keeps the interview finished when confirmation is cancelled', async () => {
    openDialog.mockResolvedValue(false);
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleMarkUnfinished(
        {
          id: 's1',
          caseId: 'case-1',
        },
        stages,
      );
    });

    expect(markSessionUnfinished).not.toHaveBeenCalled();
  });
});
