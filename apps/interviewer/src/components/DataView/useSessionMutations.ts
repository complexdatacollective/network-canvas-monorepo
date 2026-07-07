import { useCallback, useRef, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import {
  deleteSessions,
  getSettings,
  markSessionsExported,
} from '~/lib/db/api';
import {
  buildExportOptions,
  type ExportProgress,
  runExport,
} from '~/lib/export/exportSessions';
import { shareOrDownloadBlob } from '~/lib/files/download';

const noopExportEvent = (_event: ExportProgress) => {};

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
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Archive built by handleExport, awaiting a fresh user gesture to
  // share/download it — see handleShareReady. sessionIds are the sessions
  // whose export generation succeeded; they are marked exportedAt only once
  // the file is confirmed saved, never on the in-memory build.
  const [pendingShare, setPendingShare] = useState<{
    blob: Blob;
    fileName: string;
    sessionIds: string[];
    exportGraphML: boolean;
    exportCSV: boolean;
    failedCount: number;
  } | null>(null);

  const handleExport = useCallback(async () => {
    if (selectedCount === 0 || exporting) return;
    setExporting(true);
    try {
      const ids = await resolveSelectedIds();
      if (ids.length === 0) {
        setExporting(false);
        return;
      }
      const settings = await getSettings();
      if (settings.requireUnlockOnExport) {
        const stepUp = await requireFreshUnlock();
        if (!stepUp.ok) {
          setExporting(false);
          return;
        }
      }
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
        onEvent: noopExportEvent,
      });
      if (!blob || !fileName) {
        throw new Error('Export produced no file');
      }
      if (result.failedExports.length > 0) {
        toast.add({
          title: 'Export completed with errors',
          description: `${result.failedExports.length} session(s) failed.`,
          variant: 'destructive',
        });
      }
      setPendingShare({
        blob,
        fileName,
        sessionIds: result.successfulExports.map((s) => s.sessionId),
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        failedCount: result.failedExports.length,
      });
      toast.add({
        title: 'Archive ready',
        description: 'Tap Save export to share or download the archive.',
      });
      clearSelection();
      await Promise.all([onReload(), reloadData()]);
    } catch (cause) {
      analytics.captureException(cause, { feature: 'export' });
      toast.add({
        title: 'Export failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [
    analytics,
    clearSelection,
    exporting,
    onReload,
    reloadData,
    requireFreshUnlock,
    resolveSelectedIds,
    selectedCount,
    toast,
  ]);

  // Runs in the "Save export" button's own click — a gesture the long-running
  // archive build in handleExport would otherwise have consumed — so
  // navigator.share stays gesture-fresh on iOS Safari.
  const shareInFlightRef = useRef(false);
  const handleShareReady = useCallback(async () => {
    // A double-tap on Save export would otherwise start two save flows and
    // double the export marking + analytics event; guard against re-entry.
    if (!pendingShare || shareInFlightRef.current) return;
    shareInFlightRef.current = true;
    const {
      blob,
      fileName,
      sessionIds,
      exportGraphML,
      exportCSV,
      failedCount,
    } = pendingShare;
    try {
      const outcome = await shareOrDownloadBlob(blob, fileName);
      if (!outcome.saved) {
        // pendingShare is retained so the Save export button stays available
        // for a retry; sessions are NOT marked exported until a genuine save.
        toast.add({
          title: 'Export canceled',
          description: 'The archive was not saved.',
        });
        return;
      }
      // The object-URL <a download> path can't observe whether the Save-As
      // dialog was completed or cancelled/blocked, so it reports an
      // unconfirmed save. Marking exportedAt on that unverifiable claim is a
      // data-loss primitive (a falsely-"exported" session can be filtered and
      // bulk-deleted). Require the researcher to confirm the file downloaded
      // before we stamp it as exported; keep pendingShare for a retry if not.
      if (!outcome.confirmed) {
        const downloaded = await dialog.openDialog({
          type: 'choice',
          title: 'Did the archive download?',
          description:
            'Confirm the export file saved to this device before it is marked as exported. If it did not download, choose Not yet and try Save export again.',
          intent: 'warning',
          actions: {
            primary: { label: 'Yes, it downloaded', value: true },
            cancel: { label: 'Not yet', value: false },
          },
        });
        if (downloaded !== true) {
          toast.add({
            title: 'Not marked as exported',
            description: 'Try Save export again to download the archive.',
          });
          return;
        }
      }
      await markSessionsExported(sessionIds);
      // Counts only — never session contents, case IDs, or file names.
      analytics.track('data_exported', {
        interview_count: sessionIds.length,
        failed_count: failedCount,
        export_graphml: exportGraphML,
        export_csv: exportCSV,
      });
      setPendingShare(null);
      // Refresh so the just-set exportedAt shows in the Export status column
      // and the status filter/counts; the mark now happens here rather than in
      // handleExport, so its reload no longer covers it.
      await Promise.all([onReload(), reloadData()]);
      toast.add({
        title: 'Export complete',
        description: fileName,
        variant: 'success',
      });
    } catch (cause) {
      // pendingShare is retained on failure: the built archive is still
      // valid, so the Save export button stays available for a retry.
      analytics.captureException(cause, { feature: 'export' });
      toast.add({
        title: 'Export failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      shareInFlightRef.current = false;
    }
  }, [analytics, dialog, onReload, pendingShare, reloadData, toast]);

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

  return {
    exporting,
    deleting,
    handleExport,
    handleDelete,
    handleShareReady,
    pendingShare,
  };
}
