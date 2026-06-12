import { useCallback, useState } from 'react';

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
import { downloadBlob } from '~/lib/files/download';

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
      const download = await downloadBlob(blob, fileName);
      if (!download.saved) {
        toast.add({
          title: 'Export canceled',
          description: 'The archive was not saved.',
        });
        return;
      }
      await markSessionsExported(
        result.successfulExports.map((s) => s.sessionId),
      );
      // Counts only — never session contents, case IDs, or file names.
      analytics.track('data_exported', {
        interview_count: result.successfulExports.length,
        failed_count: result.failedExports.length,
        export_graphml: settings.exportGraphML,
        export_csv: settings.exportCSV,
      });
      if (result.failedExports.length > 0) {
        toast.add({
          title: 'Export completed with errors',
          description: `${result.failedExports.length} session(s) failed.`,
          variant: 'destructive',
        });
      } else {
        toast.add({
          title: 'Export complete',
          description: fileName,
          variant: 'success',
        });
      }
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

  return { exporting, deleting, handleExport, handleDelete };
}
