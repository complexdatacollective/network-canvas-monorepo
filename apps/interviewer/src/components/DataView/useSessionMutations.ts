import { createElement, useCallback, useEffect, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import type { ExportEvent } from '@codaco/network-exporters/events';
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

const messages = defineMessages({
  zipArchive: {
    id: 'interviewer.sessionMutations.zipArchive',
    defaultMessage: 'ZIP archive',
    description:
      'File type description in the native Save As picker for an exported interview archive. ZIP is the file format name.',
  },
  exportComplete: {
    id: 'interviewer.sessionMutations.exportComplete',
    defaultMessage: 'Export complete',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  exportFailed: {
    id: 'interviewer.sessionMutations.exportFailed',
    defaultMessage: 'Export failed',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  deleteFailed: {
    id: 'interviewer.sessionMutations.deleteFailed',
    defaultMessage: 'Delete failed',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  markUnfinished: {
    id: 'interviewer.sessionMutations.markUnfinished',
    defaultMessage: 'Mark unfinished?',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  thisInterviewWillBecomeEditableAndCan: {
    id: 'interviewer.sessionMutations.thisInterviewWillBecomeEditableAndCan',
    defaultMessage:
      'This interview will become editable and can be resumed. Its existing responses and export history will be kept.',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  markUnfinished2: {
    id: 'interviewer.sessionMutations.markUnfinished2',
    defaultMessage: 'Mark unfinished',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  interviewMarkedUnfinished: {
    id: 'interviewer.sessionMutations.interviewMarkedUnfinished',
    defaultMessage: 'Interview marked unfinished',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  couldNotMarkInterviewUnfinished: {
    id: 'interviewer.sessionMutations.couldNotMarkInterviewUnfinished',
    defaultMessage: 'Could not mark interview unfinished',
    description: 'User-facing message in Interviewer Session Mutations.',
  },
  deleteSelected: {
    id: 'interviewer.sessionMutations.deleteSelected',
    defaultMessage:
      '{count, plural, one {Delete # interview?} other {Delete # interviews?}}',
    description: 'Administration text in Interviewer useSessionMutations.',
  },
  deleteDescription: {
    id: 'interviewer.sessionMutations.deleteDescription',
    defaultMessage:
      '{count, plural, one {This record will be permanently removed from this device. This cannot be undone.} other {These records will be permanently removed from this device. This cannot be undone.}}',
    description: 'Administration text in Interviewer useSessionMutations.',
  },
  deleted: {
    id: 'interviewer.sessionMutations.deleted',
    defaultMessage:
      '{count, plural, one {Deleted # interview} other {Deleted # interviews}}',
    description: 'Administration text in Interviewer useSessionMutations.',
  },
  resumable: {
    id: 'interviewer.sessionMutations.resumable',
    defaultMessage: '{caseId} can now be resumed.',
    description: 'Administration text in Interviewer useSessionMutations.',
  },
  operationFailed: {
    id: 'interviewer.sessionMutations.operationFailed',
    defaultMessage:
      'The operation could not be completed. Your interview data remains on this device. Please try again.',
    description: 'Administration text in Interviewer useSessionMutations.',
  },
});

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
      stage: ExportEvent['stage'];
      // null until the current stage emits a progress event with a total
      // (indeterminate); reset on every stage transition so a finished
      // stage's bar never bleeds into the next stage.
      current: number | null;
      total: number | null;
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
  | {
      phase: 'error';
      message: string;
      // Stack trace (or stringified cause) for the dialog's copyable
      // error-details support flow.
      detail: string;
    };

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
  const intl = useAppIntl();
  const toast = useToast();
  const dialog = useDialog();
  const analytics = useAnalytics();
  const { requireFreshUnlock } = useStepUpAuth();
  const [exportFlow, setExportFlow] = useState<ExportFlow>({ phase: 'idle' });
  // True from the Export tap until handleExport settles. The flow stays
  // `idle` through the pre-build awaits (id resolution, settings, step-up),
  // so without this render-visible flag the toolbar's competing mutations
  // would stay enabled and a delete confirmation could race the build.
  const [preparingExport, setPreparingExport] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markingUnfinishedId, setMarkingUnfinishedId] = useState<string | null>(
    null,
  );
  const abortBuildRef = useRef<AbortController | null>(null);

  // Leaving the view (back gesture, view switch) unmounts the dialog and its
  // Cancel action — abort any in-flight build so the pipeline (and its ZIP
  // sink) tears down instead of burning CPU and memory headlessly.
  useEffect(() => {
    return () => {
      abortBuildRef.current?.abort();
    };
  }, []);

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
    setPreparingExport(true);
    const controller = new AbortController();
    // Registered before the pre-build awaits so the unmount cleanup can
    // cancel an export that is still resolving ids, settings, or step-up —
    // otherwise the continuation would start a headless build.
    abortBuildRef.current = controller;
    try {
      const ids = await resolveSelectedIds();
      if (ids.length === 0) return;
      const settings = await getSettings();
      if (settings.requireUnlockOnExport) {
        const stepUp = await requireFreshUnlock();
        if (!stepUp.ok) return;
      }
      if (controller.signal.aborted) return;
      setExportFlow({
        phase: 'building',
        sessionCount: ids.length,
        stage: 'fetching',
        current: null,
        total: null,
      });
      // Let the dialog finish animating in before the CPU-heavy build starts
      // competing with it for the main thread.
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (controller.signal.aborted) return;
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
              // Progress is stage-local: carrying the previous stage's counts
              // forward would show a full bar for work that hasn't started.
              return {
                ...current,
                stage: event.stage,
                current: null,
                total: null,
              };
            }
            if (event.total <= 0) return current;
            return { ...current, current: event.current, total: event.total };
          });
        },
      });
      // Cancellation can race a build that was already resolving; the cancel
      // wins — never resurface a dialog the user dismissed. handleCancelBuild
      // already reset the flow; the extra reset here is defence against that
      // coupling changing.
      if (controller.signal.aborted) {
        setExportFlow({ phase: 'idle' });
        return;
      }
      if (!blob || !fileName) {
        throw new Error('Export produced no file');
      }
      // successfulExports/failedExports carry one entry per generated file
      // (format × partition), not per interview — collapse to interview-level
      // before anything user-facing (counts, marking, analytics) consumes it.
      const exportedIds = [
        ...new Set(result.successfulExports.map((s) => s.sessionId)),
      ];
      const failedCount = new Set(result.failedExports.map((f) => f.sessionId))
        .size;
      setExportFlow({
        phase: 'ready',
        blob,
        fileName,
        sessionIds: exportedIds,
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        failedCount,
      });
    } catch (cause) {
      // A cancelled build already reset the flow; its rejection is not an
      // error.
      if (controller.signal.aborted) {
        setExportFlow({ phase: 'idle' });
        return;
      }
      analytics.captureException(cause, { feature: 'export' });
      setExportFlow({
        phase: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
        detail:
          cause instanceof Error
            ? (cause.stack ?? cause.message)
            : String(cause),
      });
    } finally {
      exportInFlightRef.current = false;
      setPreparingExport(false);
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
      const outcome = await saveBlob(
        blob,
        fileName,
        intl.formatMessage(messages.zipArchive),
      );
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
      toast.add({
        title: createElement(AppMessage, { message: messages.exportComplete }),
        description: fileName,
        variant: 'success',
      });
    } catch (cause) {
      // Failures up to the save/mark boundary keep the archive and return the
      // dialog to the ready state for a retry.
      analytics.captureException(cause, { feature: 'export' });
      setExportFlow({ ...exportFlow, phase: 'ready' });
      toast.add({
        title: createElement(AppMessage, { message: messages.exportFailed }),
        description: createElement(AppMessage, {
          message: messages.operationFailed,
        }),
        variant: 'destructive',
      });
      return;
    } finally {
      shareInFlightRef.current = false;
    }
    // Refresh so the just-set exportedAt shows in the Export status column and
    // the status filter/counts. Deliberately outside the retry domain: the
    // archive is saved and the sessions are marked, so a refresh failure must
    // not resurrect the save flow and invite a duplicate export.
    try {
      await Promise.all([onReload(), reloadData()]);
    } catch (cause) {
      analytics.captureException(cause, { feature: 'export' });
    }
  }, [
    analytics,
    clearSelection,
    exportFlow,
    intl,
    onReload,
    reloadData,
    toast,
  ]);

  const handleDelete = useCallback(async () => {
    // Also guarded against the export flow: the toolbar disables Delete while
    // an export is preparing/active, but the guard is the correctness layer.
    if (
      selectedCount === 0 ||
      deleting ||
      preparingExport ||
      exportFlow.phase !== 'idle'
    ) {
      return;
    }
    const confirmed = await dialog.openDialog({
      type: 'choice',
      title: createElement(AppMessage, {
        message: messages.deleteSelected,
        values: {
          count: selectedCount,
        },
      }),
      description: createElement(AppMessage, {
        message: messages.deleteDescription,
        values: {
          count: selectedCount,
        },
      }),
      intent: 'destructive',
      actions: {
        primary: {
          label: createElement(AppMessage, { message: commonMessages.delete }),
          value: true,
        },
        cancel: {
          label: createElement(AppMessage, { message: commonMessages.cancel }),
          value: false,
        },
      },
    });
    if (confirmed !== true) return;
    setDeleting(true);
    try {
      const ids = await resolveSelectedIds();
      if (ids.length === 0) return;
      await deleteSessions(ids);
      toast.add({
        title: createElement(AppMessage, {
          message: messages.deleted,
          values: { count: ids.length },
        }),
        variant: 'success',
      });
      clearSelection();
      await Promise.all([onReload(), reloadData()]);
    } catch (cause) {
      toast.add({
        title: createElement(AppMessage, { message: messages.deleteFailed }),
        description: createElement(AppMessage, {
          message: messages.operationFailed,
        }),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [
    clearSelection,
    deleting,
    dialog,
    exportFlow.phase,
    onReload,
    preparingExport,
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
      // Guarded against the export flow so a session mutation can't race an
      // export that is preparing or has an unsaved archive in flight.
      if (
        markingUnfinishedId !== null ||
        preparingExport ||
        exportFlow.phase !== 'idle'
      ) {
        return;
      }
      const confirmed = await dialog.openDialog({
        type: 'choice',
        title: createElement(AppMessage, { message: messages.markUnfinished }),
        description: createElement(AppMessage, {
          message: messages.thisInterviewWillBecomeEditableAndCan,
        }),
        intent: 'warning',
        actions: {
          primary: {
            label: createElement(AppMessage, {
              message: messages.markUnfinished2,
            }),
            value: true,
          },
          cancel: {
            label: createElement(AppMessage, {
              message: commonMessages.cancel,
            }),
            value: false,
          },
        },
      });
      if (confirmed !== true) return;
      setMarkingUnfinishedId(session.id);
      try {
        await markSessionUnfinished(session.id, stages);
        toast.add({
          title: createElement(AppMessage, {
            message: messages.interviewMarkedUnfinished,
          }),
          description: createElement(AppMessage, {
            message: messages.resumable,
            values: {
              caseId: session.caseId,
            },
          }),
          variant: 'success',
        });
        await Promise.all([onReload(), reloadData()]);
      } catch (cause) {
        toast.add({
          title: createElement(AppMessage, {
            message: messages.couldNotMarkInterviewUnfinished,
          }),
          description: createElement(AppMessage, {
            message: messages.operationFailed,
          }),
          variant: 'destructive',
        });
      } finally {
        setMarkingUnfinishedId(null);
      }
    },
    [
      dialog,
      exportFlow.phase,
      markingUnfinishedId,
      onReload,
      preparingExport,
      reloadData,
      toast,
    ],
  );

  return {
    exportFlow,
    preparingExport,
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
