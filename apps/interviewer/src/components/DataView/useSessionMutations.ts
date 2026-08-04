import { useCallback, useRef, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { stageMessages } from '@codaco/network-exporters/events';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import {
  deleteSessions,
  getSettings,
  markSessionUnfinished,
  markSessionsExported,
} from '~/lib/db/api';
import type { StoredSessionLite } from '~/lib/db/types';
import { buildExportOptions, runExport } from '~/lib/export/exportSessions';
import { saveBlob } from '~/lib/files/download';

// The export flow drives ExportDialog end-to-end. `ready` holds the built
// archive awaiting a fresh user gesture to save it (Web Share must be invoked
// within a user activation the long archive build would otherwise have
// consumed — see the 2026-08-04 export-dialog spec). sessionIds are the
// sessions whose export generation succeeded; they are marked exportedAt only
// once the file is saved, never on the in-memory build.
export type ExportFlow =
  | { phase: 'idle' }
  | {
      phase: 'building';
      sessionCount: number;
      stageMessage: string;
      // null until a progress event with a total arrives (indeterminate).
      percent: number | null;
    }
  | {
      phase: 'ready' | 'saving';
      blob: Blob;
      fileName: string;
      sessionIds: string[];
      exportGraphML: boolean;
      exportCSV: boolean;
      failedCount: number;
    }
  | { phase: 'error'; message: string };

// Owns the bulk actions on the current selection — export (with optional
// step-up auth) and delete (with confirmation) — plus their in-flight flags.
export function useSessionMutations({
  selectedCount,
  resolveSelectedIds,
  clearSelection,
  onReload,
  reloadData,
}: {
  selectedCount: number;
  resolveSelectedIds: () => Promise<string[]>;
  clearSelection: () => void;
  onReload: () => Promise<void>;
  reloadData: () => Promise<void>;
}) {
  const toast = useToast();
  const dialog = useDialog();
  const analytics = useAnalytics();
  const { requireFreshUnlock } = useStepUpAuth();
  const [exportFlow, setExportFlow] = useState<ExportFlow>({ phase: 'idle' });
  const [deleting, setDeleting] = useState(false);
  const [markingUnfinishedId, setMarkingUnfinishedId] = useState<string | null>(
    null,
  );
  const abortBuildRef = useRef<AbortController | null>(null);

  // Like shareInFlightRef below: state commits are scheduled, so two Export
  // clicks in the same frame would both read `idle` — the ref closes that
  // window until the `building` phase renders and disables the trigger.
  const exportInFlightRef = useRef(false);

  const handleExport = useCallback(async () => {
    if (
      selectedCount === 0 ||
      exportFlow.phase !== 'idle' ||
      exportInFlightRef.current
    ) {
      return;
    }
    exportInFlightRef.current = true;
    const controller = new AbortController();
    try {
      const ids = await resolveSelectedIds();
      if (ids.length === 0) return;
      const settings = await getSettings();
      if (settings.requireUnlockOnExport) {
        const stepUp = await requireFreshUnlock();
        if (!stepUp.ok) return;
      }
      abortBuildRef.current = controller;
      setExportFlow({
        phase: 'building',
        sessionCount: ids.length,
        stageMessage: stageMessages.fetching,
        percent: null,
      });
      const options = buildExportOptions({
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        useScreenLayoutCoordinates: settings.useScreenLayoutCoordinates,
        screenLayoutHeight: settings.screenLayoutHeight,
        screenLayoutWidth: settings.screenLayoutWidth,
      });
      const { result, blob, fileName } = await runExport({
        options,
        sessionIds: ids,
        signal: controller.signal,
        onEvent: (event) => {
          setExportFlow((current) => {
            if (current.phase !== 'building') return current;
            if (event.type === 'stage') {
              return { ...current, stageMessage: event.message };
            }
            if (event.total <= 0) return current;
            return {
              ...current,
              percent: Math.round((event.current / event.total) * 100),
            };
          });
        },
      });
      // Cancellation can race a build that was already resolving; the cancel
      // wins — never resurface a dialog the user dismissed.
      if (controller.signal.aborted) return;
      if (!blob || !fileName) {
        throw new Error('Export produced no file');
      }
      setExportFlow({
        phase: 'ready',
        blob,
        fileName,
        sessionIds: result.successfulExports.map((s) => s.sessionId),
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        failedCount: result.failedExports.length,
      });
    } catch (cause) {
      // A cancelled build already reset the flow; its rejection is not an
      // error.
      if (controller.signal.aborted) return;
      analytics.captureException(cause, { feature: 'export' });
      setExportFlow({
        phase: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      exportInFlightRef.current = false;
      if (abortBuildRef.current === controller) {
        abortBuildRef.current = null;
      }
    }
  }, [
    analytics,
    exportFlow.phase,
    requireFreshUnlock,
    resolveSelectedIds,
    selectedCount,
  ]);

  const handleCancelBuild = useCallback(() => {
    if (exportFlow.phase !== 'building') return;
    abortBuildRef.current?.abort();
    setExportFlow({ phase: 'idle' });
  }, [exportFlow.phase]);

  // Discards a built-but-unsaved archive (or dismisses the error state).
  // Nothing is marked exported and the selection is retained, so re-exporting
  // is one tap.
  const handleDismissExport = useCallback(() => {
    if (exportFlow.phase !== 'ready' && exportFlow.phase !== 'error') return;
    setExportFlow({ phase: 'idle' });
  }, [exportFlow.phase]);

  // Runs in the export dialog's primary action click — a gesture the
  // long-running archive build in handleExport would otherwise have consumed —
  // so the Save-As picker / navigator.share stays gesture-fresh. saveBlob must
  // be reached with no `await` before it.
  const shareInFlightRef = useRef(false);
  const handleShareReady = useCallback(async () => {
    // Re-entry is guarded by a ref, not the `saving` phase: state updates are
    // scheduled, so two clicks in the same frame would both read `ready`.
    if (exportFlow.phase !== 'ready' || shareInFlightRef.current) return;
    shareInFlightRef.current = true;
    const {
      blob,
      fileName,
      sessionIds,
      exportGraphML,
      exportCSV,
      failedCount,
    } = exportFlow;
    setExportFlow({ ...exportFlow, phase: 'saving' });
    try {
      const outcome = await saveBlob(blob, fileName);
      if (!outcome.saved) {
        // The archive is retained and the dialog stays open in the ready
        // state — that is the retry affordance; sessions are NOT marked
        // exported until a genuine save.
        setExportFlow({ ...exportFlow, phase: 'ready' });
        return;
      }
      await markSessionsExported(sessionIds);
      // Counts only — never session contents, case IDs, or file names.
      analytics.track('data_exported', {
        interview_count: sessionIds.length,
        failed_count: failedCount,
        export_graphml: exportGraphML,
        export_csv: exportCSV,
      });
      setExportFlow({ phase: 'idle' });
      clearSelection();
      // Refresh so the just-set exportedAt shows in the Export status column
      // and the status filter/counts.
      await Promise.all([onReload(), reloadData()]);
      toast.add({
        title: 'Export complete',
        description: fileName,
        variant: 'success',
      });
    } catch (cause) {
      // The built archive is still valid, so the dialog returns to the ready
      // state for a retry.
      analytics.captureException(cause, { feature: 'export' });
      setExportFlow({ ...exportFlow, phase: 'ready' });
      toast.add({
        title: 'Export failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      shareInFlightRef.current = false;
    }
  }, [analytics, clearSelection, exportFlow, onReload, reloadData, toast]);

  const handleDelete = useCallback(async () => {
    if (selectedCount === 0 || deleting) return;
    const noun = selectedCount === 1 ? 'interview' : 'interviews';
    const confirmed = await dialog.openDialog({
      type: 'choice',
      title: `Delete ${selectedCount} ${noun}?`,
      description: `${selectedCount === 1 ? 'This record' : 'These records'} will be permanently removed from this device. This cannot be undone.`,
      intent: 'destructive',
      actions: {
        primary: { label: 'Delete', value: true },
        cancel: { label: 'Cancel', value: false },
      },
    });
    if (confirmed !== true) return;
    setDeleting(true);
    try {
      const ids = await resolveSelectedIds();
      if (ids.length === 0) return;
      await deleteSessions(ids);
      toast.add({
        title: `Deleted ${ids.length} ${ids.length === 1 ? 'interview' : 'interviews'}`,
        variant: 'success',
      });
      clearSelection();
      await Promise.all([onReload(), reloadData()]);
    } catch (cause) {
      toast.add({
        title: 'Delete failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [
    clearSelection,
    deleting,
    dialog,
    onReload,
    reloadData,
    resolveSelectedIds,
    selectedCount,
    toast,
  ]);

  const handleMarkUnfinished = useCallback(
    async (
      session: Pick<StoredSessionLite, 'id' | 'caseId'>,
      stages: CurrentProtocol['stages'],
    ) => {
      if (markingUnfinishedId !== null) return;
      const confirmed = await dialog.openDialog({
        type: 'choice',
        title: 'Mark unfinished?',
        description:
          'This interview will become editable and can be resumed. Its existing responses and export history will be kept.',
        intent: 'warning',
        actions: {
          primary: { label: 'Mark unfinished', value: true },
          cancel: { label: 'Cancel', value: false },
        },
      });
      if (confirmed !== true) return;
      setMarkingUnfinishedId(session.id);
      try {
        await markSessionUnfinished(session.id, stages);
        toast.add({
          title: 'Interview marked unfinished',
          description: `${session.caseId} can now be resumed.`,
          variant: 'success',
        });
        await Promise.all([onReload(), reloadData()]);
      } catch (cause) {
        toast.add({
          title: 'Could not mark interview unfinished',
          description: cause instanceof Error ? cause.message : String(cause),
          variant: 'destructive',
        });
      } finally {
        setMarkingUnfinishedId(null);
      }
    },
    [dialog, markingUnfinishedId, onReload, reloadData, toast],
  );

  return {
    exportFlow,
    deleting,
    markingUnfinishedId,
    handleExport,
    handleCancelBuild,
    handleDismissExport,
    handleDelete,
    handleMarkUnfinished,
    handleShareReady,
  };
}
