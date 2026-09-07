import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ComponentType, PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { interviewerProductionLocales } from '~/i18n/locales';
import type * as Download from '~/lib/files/download';
import { interviewerCatalogs } from '~/locales/catalogs';
import { renderedMessage } from '~/testUtils/renderedMessage';

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
const track = vi.fn();
const captureException = vi.fn();
const requireFreshUnlock = vi.fn().mockResolvedValue({ ok: true });
const clearSelection = vi.fn();

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
  useAnalytics: () => ({ track, captureException }),
}));

vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({ requireFreshUnlock }),
}));

function makeHook(wrapper?: ComponentType<PropsWithChildren>) {
  return renderHook(
    () =>
      useSessionMutations({
        selectedCount: 1,
        resolveSelectedIds: () => Promise.resolve(['s1']),
        clearSelection,
        onReload: () => Promise.resolve(),
        reloadData: () => Promise.resolve(),
      }),
    { wrapper },
  );
}

async function buildReadyArchive(
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
  expect(result.current.exportFlow.phase).toBe('ready');
}

// A runExport stand-in that emits nothing and settles only via abort, so
// tests can observe the building state and drive cancellation.
function hangingRunExport() {
  let emit: ((event: unknown) => void) | undefined;
  let signal: AbortSignal | undefined;
  runExport.mockImplementation(
    (invocation: {
      onEvent?: (event: unknown) => void;
      signal?: AbortSignal;
    }) => {
      emit = invocation.onEvent;
      signal = invocation.signal;
      return new Promise((_, reject) => {
        invocation.signal?.addEventListener('abort', () =>
          reject(new Error('interrupted')),
        );
      });
    },
  );
  return {
    emit: (event: unknown) => emit?.(event),
    getSignal: () => signal,
  };
}

describe('useSessionMutations — export flow marks exported from the save outcome alone', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks exported and clears the selection when the save succeeds', async () => {
    saveBlob.mockResolvedValue({ saved: true });

    const { result } = makeHook();
    await buildReadyArchive(result);
    // Selection survives the build: it clears only on a genuine save.
    expect(clearSelection).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(openDialog).not.toHaveBeenCalled();
    expect(markSessionsExported).toHaveBeenCalledWith(['s1']);
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(result.current.exportFlow.phase).toBe('idle');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: renderedMessage('Export complete') }),
    );
  });

  it('opens the native picker in the current language after cancelling and switching, without rebuilding the archive', async () => {
    const actualDownload = await vi.importActual<typeof Download>(
      '~/lib/files/download',
    );
    saveBlob.mockImplementation(actualDownload.saveBlob);
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
      .mockResolvedValue({ createWritable });
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
    let locale = 'en';
    function Wrapper({ children }: PropsWithChildren) {
      return createElement(AppI18nProvider, {
        locale,
        locales: interviewerProductionLocales,
        messages: interviewerCatalogs[locale],
        // This .ts test supplies the provider's required children prop without JSX.
        // eslint-disable-next-line react/no-children-prop
        children,
      });
    }
    const { result, rerender } = makeHook(Wrapper);
    await buildReadyArchive(result);
    const archive = result.current.exportFlow;
    if (archive.phase !== 'ready') throw new Error('Expected a ready archive');
    await act(async () => {
      await result.current.handleShareReady();
    });
    expect(showSaveFilePicker).toHaveBeenNthCalledWith(1, {
      suggestedName: 'export.zip',
      types: [
        { description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } },
      ],
    });
    expect(result.current.exportFlow.phase).toBe('ready');
    expect(markSessionsExported).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    locale = 'es';
    rerender();
    let pickerCallsBeforeYield = 0;
    await act(async () => {
      const saving = result.current.handleShareReady();
      // Reaching the native API before the first await preserves the click's
      // user activation even when the archive was built in another language.
      pickerCallsBeforeYield = showSaveFilePicker.mock.calls.length;
      await saving;
    });
    expect(pickerCallsBeforeYield).toBe(2);
    expect(showSaveFilePicker).toHaveBeenNthCalledWith(2, {
      suggestedName: 'export.zip',
      types: [
        { description: 'Archivo ZIP', accept: { 'application/zip': ['.zip'] } },
      ],
    });
    expect(runExport).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledExactlyOnceWith(archive.blob);
    expect(close).toHaveBeenCalledOnce();
    expect(markSessionsExported).toHaveBeenCalledExactlyOnceWith(['s1']);
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(result.current.exportFlow.phase).toBe('idle');
  });

  it('does NOT mark exported when the save is cancelled, and keeps the archive for a retry', async () => {
    saveBlob.mockResolvedValue({ saved: false });

    const { result } = makeHook();
    await buildReadyArchive(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(markSessionsExported).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
    // The dialog staying open in the ready state is the retry affordance —
    // no toast fires on a cancelled share.
    expect(toastAdd).not.toHaveBeenCalled();
    expect(result.current.exportFlow.phase).toBe('ready');
  });

  it('does NOT mark exported when the save throws, and keeps the archive for a retry', async () => {
    saveBlob.mockRejectedValue(new Error('QuotaExceededError'));

    const { result } = makeHook();
    await buildReadyArchive(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    expect(markSessionsExported).not.toHaveBeenCalled();
    expect(result.current.exportFlow.phase).toBe('ready');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: renderedMessage('Export failed') }),
    );
  });

  it('a double-tap on the save action starts exactly one save', async () => {
    let resolveSave: ((outcome: { saved: boolean }) => void) | undefined;
    saveBlob.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { result } = makeHook();
    await buildReadyArchive(result);

    await act(async () => {
      const first = result.current.handleShareReady();
      const second = result.current.handleShareReady();
      resolveSave?.({ saved: true });
      await Promise.all([first, second]);
    });

    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(markSessionsExported).toHaveBeenCalledTimes(1);
  });
});

describe('useSessionMutations — export flow lifecycle', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('a double-tap on Export starts exactly one build', async () => {
    runExport.mockResolvedValue({
      result: {
        successfulExports: [{ sessionId: 's1' }],
        failedExports: [],
      },
      blob: new Blob(['x']),
      fileName: 'export.zip',
    });
    const { result } = makeHook();

    await act(async () => {
      await Promise.all([
        result.current.handleExport(),
        result.current.handleExport(),
      ]);
    });

    expect(runExport).toHaveBeenCalledTimes(1);
    expect(result.current.exportFlow.phase).toBe('ready');
  });

  it('exposes a render-visible preparing flag during pre-build resolution', async () => {
    let resolveIds: ((ids: string[]) => void) | undefined;
    const slowResolveSelectedIds = () =>
      new Promise<string[]>((resolve) => {
        resolveIds = resolve;
      });
    runExport.mockResolvedValue({
      result: {
        successfulExports: [{ sessionId: 's1' }],
        failedExports: [],
      },
      blob: new Blob(['x']),
      fileName: 'export.zip',
    });
    const { result } = renderHook(() =>
      useSessionMutations({
        selectedCount: 1,
        resolveSelectedIds: slowResolveSelectedIds,
        clearSelection,
        onReload: () => Promise.resolve(),
        reloadData: () => Promise.resolve(),
      }),
    );

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.handleExport();
    });

    // The flow is still idle while the selection resolves, but the flag must
    // already disable the toolbar's competing mutations.
    await waitFor(() => expect(result.current.preparingExport).toBe(true));
    expect(result.current.exportFlow.phase).toBe('idle');

    await act(async () => {
      resolveIds?.(['s1']);
      await exportPromise;
    });

    expect(result.current.preparingExport).toBe(false);
    expect(result.current.exportFlow.phase).toBe('ready');
  });

  it('unmounting during pre-build resolution prevents the build from starting', async () => {
    let resolveSettings: ((settings: unknown) => void) | undefined;
    getSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSettings = resolve;
        }),
    );
    const { result, unmount } = makeHook();

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.handleExport();
    });
    await waitFor(() => expect(getSettings).toHaveBeenCalled());

    unmount();

    await act(async () => {
      resolveSettings?.({
        requireUnlockOnExport: false,
        exportGraphML: true,
        exportCSV: false,
        useScreenLayoutCoordinates: false,
        screenLayoutHeight: 0,
        screenLayoutWidth: 0,
      });
      await exportPromise;
    });

    // The controller was registered before the awaits, so the unmount abort
    // reaches the continuation and no headless build starts.
    expect(runExport).not.toHaveBeenCalled();
  });

  it('mark unfinished is refused while an export archive is unsaved', async () => {
    const { result } = makeHook();
    await buildReadyArchive(result);

    await act(async () => {
      await result.current.handleMarkUnfinished(
        { id: 's1', caseId: 'case-1' },
        [],
      );
    });

    expect(openDialog).not.toHaveBeenCalled();
    expect(markSessionUnfinished).not.toHaveBeenCalled();
  });

  it('aborts an in-flight build when the view unmounts', async () => {
    const { getSignal } = hangingRunExport();
    const { result, unmount } = makeHook();

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.handleExport();
    });
    await waitFor(() => expect(runExport).toHaveBeenCalled(), {
      timeout: 2000,
    });

    unmount();

    expect(getSignal()?.aborted).toBe(true);
    await act(async () => {
      await exportPromise;
    });
  });

  it('dismissing a ready archive discards it without marking, keeping the selection', async () => {
    const { result } = makeHook();
    await buildReadyArchive(result);

    act(() => {
      result.current.handleDismissExport();
    });

    expect(result.current.exportFlow.phase).toBe('idle');
    expect(markSessionsExported).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it('surfaces stage and progress events while building, resetting counts per stage', async () => {
    const { emit } = hangingRunExport();
    const { result } = makeHook();

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.handleExport();
    });
    // The build waits out the dialog's entry animation before starting.
    await waitFor(() => expect(runExport).toHaveBeenCalled(), {
      timeout: 2000,
    });

    act(() => {
      emit({
        type: 'stage',
        stage: 'generating',
        message: 'Generating files...',
      });
      emit({ type: 'progress', stage: 'generating', current: 3, total: 4 });
    });

    expect(result.current.exportFlow).toMatchObject({
      phase: 'building',
      stage: 'generating',
      current: 3,
      total: 4,
    });

    // A stage transition resets stage-local progress: the finished stage's
    // full bar must not bleed into the next stage.
    act(() => {
      emit({
        type: 'stage',
        stage: 'outputting',
        message: 'Writing output...',
      });
    });

    expect(result.current.exportFlow).toMatchObject({
      phase: 'building',
      stage: 'outputting',
      current: null,
      total: null,
    });

    await act(async () => {
      result.current.handleCancelBuild();
      await exportPromise;
    });
  });

  it('cancelling a build aborts it without an error state or toast', async () => {
    hangingRunExport();
    const { result } = makeHook();

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.handleExport();
    });
    await waitFor(() =>
      expect(result.current.exportFlow.phase).toBe('building'),
    );

    await act(async () => {
      result.current.handleCancelBuild();
      await exportPromise;
    });

    expect(result.current.exportFlow.phase).toBe('idle');
    expect(captureException).not.toHaveBeenCalled();
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('a failed build lands in the error state instead of a toast', async () => {
    runExport.mockRejectedValue(new Error('zip failed'));
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.exportFlow).toMatchObject({
      phase: 'error',
      message: 'zip failed',
    });
    // The copyable support detail carries the stack, not just the message.
    const flow = result.current.exportFlow;
    if (flow.phase !== 'error') throw new Error('expected error phase');
    expect(flow.detail).toContain('zip failed');
    expect(captureException).toHaveBeenCalledOnce();
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('a refused step-up unlock leaves the flow idle without building', async () => {
    getSettings.mockResolvedValueOnce({
      requireUnlockOnExport: true,
      exportGraphML: true,
      exportCSV: false,
      useScreenLayoutCoordinates: false,
      screenLayoutHeight: 0,
      screenLayoutWidth: 0,
    });
    requireFreshUnlock.mockResolvedValueOnce({ ok: false });
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.exportFlow.phase).toBe('idle');
    expect(runExport).not.toHaveBeenCalled();
  });

  it('collapses per-format export results to interview-level counts on the ready state', async () => {
    // One interview yields one entry per generated file (format × partition):
    // counts must come from unique session ids, not raw entries.
    runExport.mockResolvedValue({
      result: {
        successfulExports: [
          { sessionId: 's1', format: 'graphml' },
          { sessionId: 's1', format: 'ego' },
        ],
        failedExports: [
          { sessionId: 's2', kind: 'generation' },
          { sessionId: 's2', kind: 'generation' },
        ],
      },
      blob: new Blob(['x']),
      fileName: 'export.zip',
    });
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.exportFlow).toMatchObject({
      phase: 'ready',
      sessionIds: ['s1'],
      failedCount: 1,
    });
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('a refresh failure after a successful save does not resurrect the save flow', async () => {
    saveBlob.mockResolvedValue({ saved: true });
    const failingReload = vi.fn().mockRejectedValue(new Error('reload failed'));
    const { result } = renderHook(() =>
      useSessionMutations({
        selectedCount: 1,
        resolveSelectedIds: () => Promise.resolve(['s1']),
        clearSelection,
        onReload: failingReload,
        reloadData: () => Promise.resolve(),
      }),
    );
    await buildReadyArchive(result);

    await act(async () => {
      await result.current.handleShareReady();
    });

    // The archive is saved and marked: a reload failure is reported, but must
    // not reopen the dialog and invite a duplicate export.
    expect(markSessionsExported).toHaveBeenCalledTimes(1);
    expect(result.current.exportFlow.phase).toBe('idle');
    expect(captureException).toHaveBeenCalledOnce();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: renderedMessage('Export complete') }),
    );
    expect(toastAdd).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: renderedMessage('Export failed') }),
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
        title: renderedMessage('Mark unfinished?'),
      }),
    );
    expect(markSessionUnfinished).toHaveBeenCalledWith('s1', stages);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: renderedMessage('Interview marked unfinished'),
      }),
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
