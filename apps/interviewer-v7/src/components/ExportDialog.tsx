import { useCallback, useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { useToast } from '@codaco/fresco-ui/Toast';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { getSettings, markSessionsExported } from '~/lib/db/api';
import type { ExportProgress } from '~/lib/export/exportSessions';
import { buildExportOptions, runExport } from '~/lib/export/exportSessions';
import { downloadBlob } from '~/lib/files/download';

type ExportDialogProps = {
  open: boolean;
  sessionIds: string[];
  onClose: () => void;
};

export function ExportDialog({ open, sessionIds, onClose }: ExportDialogProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>(
    'idle',
  );
  const [stage, setStage] = useState<string>('');
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setStage('');
      setCurrent(0);
      setTotal(0);
      setError(null);
    }
  }, [open]);

  const start = useCallback(async () => {
    setStatus('running');
    setError(null);
    try {
      const settings = await getSettings();
      const options = buildExportOptions({
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        useScreenLayoutCoordinates: settings.useScreenLayoutCoordinates,
        screenLayoutHeight: settings.screenLayoutHeight,
        screenLayoutWidth: settings.screenLayoutWidth,
      });
      const onEvent = (event: ExportProgress) => {
        if (event.type === 'stage') {
          setStage(event.message);
          setCurrent(0);
          setTotal(0);
        } else {
          setCurrent(event.current);
          setTotal(event.total);
        }
      };
      const { result, blob, fileName } = await runExport({
        options,
        sessionIds,
        onEvent,
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
        setStatus('idle');
        return;
      }
      await markSessionsExported(
        result.successfulExports.map((s) => s.sessionId),
      );
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
      setStatus('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, [sessionIds, toast]);

  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <Dialog
      open={open}
      closeDialog={status === 'running' ? undefined : onClose}
      title={`Export ${sessionIds.length} interview${sessionIds.length === 1 ? '' : 's'}`}
      description="Output formats and options are controlled in Settings."
      footer={
        status === 'idle' ? (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void start()}>
              Start export
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={status === 'running'}
            onClick={onClose}
          >
            {status === 'running' ? 'Working...' : 'Close'}
          </Button>
        )
      }
    >
      {status === 'idle' ? (
        <Paragraph>
          Pressing "Start export" will package the selected interviews into a
          `.zip` archive and download it.
        </Paragraph>
      ) : null}
      {status === 'running' ? (
        <div className="flex flex-col gap-3">
          <Paragraph>{stage || 'Preparing...'}</Paragraph>
          <ProgressBar percentProgress={progress} indeterminate={total === 0} />
        </div>
      ) : null}
      {status === 'done' ? (
        <Paragraph>Export finished. The archive has been downloaded.</Paragraph>
      ) : null}
      {status === 'error' ? (
        <Paragraph emphasis="muted">Export failed: {error}</Paragraph>
      ) : null}
    </Dialog>
  );
}
