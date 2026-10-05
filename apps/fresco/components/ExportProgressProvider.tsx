'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { useToast } from '@codaco/fresco-ui/Toast';
import type { ExportOptions } from '@codaco/network-exporters/options';
import { ensureError } from '@codaco/shared-consts';
import { commitInterviewExport } from '~/actions/interviews';
import ExportToastContent from '~/components/ExportProgress/ExportToastContent';
import { useDownload } from '~/hooks/useDownload';
import { runBatchedExport } from '~/lib/export/runBatchedExport';
import { captureClientException } from '~/lib/posthog-client';

const messages = defineMessages({
  exportError: {
    id: 'fresco.ExportProgressProvider.exportError',
    defaultMessage: 'The export could not be completed. Please try again.',
    description:
      'Researcher-facing ExportProgressProvider: The export could not be completed. Please try again.',
  },

  copyYourExportHasDownloadedInterviewSCould: {
    id: 'fresco.ExportProgressProvider.copyYourExportHasDownloadedInterviewSCould',
    defaultMessage:
      'Your export has downloaded. {value1, plural, one {# interview could not be exported.} other {# interviews could not be exported.}}',
    description:
      'Researcher-facing ExportProgressProvider: Your export has downloaded. value interview(s) could not be exported.',
  },
  copyYourExportHasDownloaded: {
    id: 'fresco.ExportProgressProvider.copyYourExportHasDownloaded',
    defaultMessage: 'Your export has downloaded.',
    description:
      'Researcher-facing ExportProgressProvider: Your export has downloaded.',
  },
  exportingInterviews: {
    id: 'fresco.ExportProgressProvider.exportingInterviews',
    defaultMessage: 'Exporting interviews',
    description:
      'Researcher-facing ExportProgressProvider: Exporting interviews',
  },
  exportDownloaded: {
    id: 'fresco.ExportProgressProvider.exportDownloaded',
    defaultMessage: 'Export downloaded',
    description: 'Researcher-facing ExportProgressProvider: Export downloaded',
  },
  yourExportDownloadedButItsStatusCould: {
    id: 'fresco.ExportProgressProvider.yourExportDownloadedButItsStatusCould',
    defaultMessage:
      'Your export downloaded, but its status could not be updated. Refresh to see the latest.',
    description:
      'Researcher-facing ExportProgressProvider: Your export downloaded, but its status could not be updated. Refresh to see the latest.',
  },
  exportComplete: {
    id: 'fresco.ExportProgressProvider.exportComplete',
    defaultMessage: 'Export complete',
    description: 'Researcher-facing ExportProgressProvider: Export complete',
  },
  exportCancelled: {
    id: 'fresco.ExportProgressProvider.exportCancelled',
    defaultMessage: 'Export cancelled',
    description: 'Researcher-facing ExportProgressProvider: Export cancelled',
  },
  theExportWasCancelled: {
    id: 'fresco.ExportProgressProvider.theExportWasCancelled',
    defaultMessage: 'The export was cancelled.',
    description:
      'Researcher-facing ExportProgressProvider: The export was cancelled.',
  },
  exportFailed: {
    id: 'fresco.ExportProgressProvider.exportFailed',
    defaultMessage: 'Export failed',
    description: 'Researcher-facing ExportProgressProvider: Export failed',
  },
});

type ExportContextValue = {
  startExport: (interviewIds: string[], exportOptions: ExportOptions) => void;
};

const ExportContext = createContext<ExportContextValue | null>(null);

export function useExportProgress() {
  const ctx = useContext(ExportContext);
  if (!ctx) {
    throw new Error(
      'useExportProgress must be used within ExportProgressProvider',
    );
  }
  return ctx;
}

export function ExportProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { add, update, close } = useToast();
  const download = useDownload();

  // Tracks whether an export is in flight, so the beforeunload warning can
  // reflect it without re-registering the listener per render.
  const exportingRef = useRef(false);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!exportingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const startExport = useCallback(
    (interviewIds: string[], exportOptions: ExportOptions) => {
      const controller = new AbortController();
      exportingRef.current = true;

      const toastId = add({
        title: <AppMessage message={messages.exportingInterviews} />,
        description: (
          <ExportToastContent
            stage="fetching"
            progress={0}
            onCancel={() => controller.abort()}
          />
        ),
        timeout: 0,
      });

      void (async () => {
        try {
          const { blob, exportedIds, failedIds } = await runBatchedExport(
            interviewIds,
            exportOptions,
            controller.signal,
            (completed, total) => {
              update(toastId, {
                description: (
                  <ExportToastContent
                    stage="generating"
                    current={completed}
                    total={total}
                    progress={total > 0 ? (completed / total) * 100 : 0}
                    onCancel={() => controller.abort()}
                  />
                ),
              });
            },
          );

          const date = new Date().toISOString().slice(0, 10);
          const objectUrl = URL.createObjectURL(blob);
          download(objectUrl, `fresco-export-${date}.zip`);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);

          // Mark exported only after the user has the complete file.
          const commit = await commitInterviewExport(exportedIds);

          close(toastId);
          if (commit.error) {
            add({
              title: <AppMessage message={messages.exportDownloaded} />,
              description: (
                <AppMessage
                  message={messages.yourExportDownloadedButItsStatusCould}
                />
              ),
              timeout: 8000,
            });
          } else {
            add({
              title: <AppMessage message={messages.exportComplete} />,
              description:
                failedIds.length > 0 ? (
                  <AppMessage
                    message={
                      messages.copyYourExportHasDownloadedInterviewSCould
                    }
                    values={{ value1: failedIds.length }}
                  />
                ) : (
                  <AppMessage message={messages.copyYourExportHasDownloaded} />
                ),
              variant: 'success',
              timeout: 8000,
            });
          }
        } catch (error) {
          if (controller.signal.aborted) {
            close(toastId);
            add({
              title: <AppMessage message={messages.exportCancelled} />,
              description: (
                <AppMessage message={messages.theExportWasCancelled} />
              ),
              timeout: 5000,
            });
            return;
          }
          const e = ensureError(error);
          captureClientException(e);
          close(toastId);
          add({
            variant: 'destructive',
            title: <AppMessage message={messages.exportFailed} />,
            description: <AppMessage message={messages.exportError} />,
            timeout: 0,
          });
        } finally {
          exportingRef.current = false;
        }
      })();
    },
    [add, update, close, download],
  );

  return (
    <ExportContext.Provider value={{ startExport }}>
      {children}
    </ExportContext.Provider>
  );
}
