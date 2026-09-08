import { createElement, useCallback, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { updateSettings } from '~/lib/db/api';

import { loadBundledSampleProtocol } from './bundledProtocols';
import {
  type ImportPhase,
  type ImportProgressEvent,
  type ImportProtocolResult,
  importBundledProtocol,
  importProtocolFromFile,
  peekProtocolName,
} from './importProtocol';
import { openProtocolValidationDetailsDialog } from './ProtocolValidationDetailsDialog';
import { SAMPLE_PROTOCOL } from './sampleProtocol';

const messages = defineMessages({
  protocolImported: {
    id: 'interviewer.protocolImport.protocolImported',
    defaultMessage: 'Protocol imported',
    description: 'User-facing message in Interviewer Protocol Import.',
  },
  importFailed: {
    id: 'interviewer.protocolImport.importFailed',
    defaultMessage: 'Import failed',
    description: 'User-facing message in Interviewer Protocol Import.',
  },
  cannotReadSelectedFile: {
    id: 'interviewer.protocolImport.cannotReadSelectedFile',
    defaultMessage:
      'This protocol file could not be read. Check that it is still available and select it again.',
    description:
      'Retry guidance when the browser cannot read a selected file before import starts, for example after it was moved or disconnected. Does not claim the protocol contents are invalid.',
  },
  viewDetails: {
    id: 'interviewer.protocolImport.viewDetails',
    defaultMessage: 'View details',
    description: 'User-facing message in Interviewer Protocol Import.',
  },
  anUnexpectedErrorOccurred: {
    id: 'interviewer.protocolImport.anUnexpectedErrorOccurred',
    defaultMessage: 'An unexpected error occurred.',
    description: 'User-facing message in Interviewer Protocol Import.',
  },
  importSuccess: {
    id: 'interviewer.protocolImport.importSuccess',
    defaultMessage:
      '{migrated, select, true {{name} was migrated to the current schema.} other {{name} is ready to use.}}',
    description: 'Administration text in Interviewer useProtocolImport.',
  },
});

export type ImportRequest = { source: 'file'; file: File; label: string };

// An in-flight protocol import, tracked by this hook and rendered by
// ProtocolDeck as a loading-state DeckCard that fills in as the import
// progresses.
export type PendingImport = {
  id: string;
  label: string;
  source: 'file' | 'sample' | 'development';
  phase: ImportPhase;
  progress?: number;
};

// Minimum time the pending (installing) card stays visible, even when the
// import itself finishes faster.
const MIN_PENDING_VISIBLE_MS = 1500;

// Pause between the pending card appearing and the import work starting.
// The deck travels to the new card when it mounts (~400ms spring), and the
// import's synchronous heavy lifting (JSZip extraction, validation) would
// stall that animation mid-flight if it started immediately.
const IMPORT_START_DELAY_MS = 600;

type StartImportRequest =
  | ImportRequest
  | { source: 'sample' }
  | { source: 'development' };

function createPendingImport(
  id: string,
  request: StartImportRequest,
  fileLabel: string,
): PendingImport {
  if (request.source === 'file') {
    return { id, label: fileLabel, source: 'file', phase: 'extracting' };
  }
  if (request.source === 'development') {
    return {
      id,
      label: 'Development Protocol',
      source: 'development',
      phase: 'extracting',
    };
  }
  return {
    id,
    label: SAMPLE_PROTOCOL.name,
    source: 'sample',
    phase: 'extracting',
  };
}

type UseProtocolImportOptions = {
  // Called after a successful install is persisted, before the pending
  // card is removed, so the real protocol card is ready to take its slot.
  onInstalled: () => Promise<void> | void;
};

export function useProtocolImport({ onInstalled }: UseProtocolImportOptions) {
  const toast = useToast();
  const dialog = useDialog();
  const analytics = useAnalytics();
  const [pendingImports, setPendingImports] = useState<PendingImport[]>([]);

  const startImport = useCallback(
    async (request: StartImportRequest) => {
      const id = crypto.randomUUID();

      let fileBuffer: Uint8Array | null = null;
      if (request.source === 'file') {
        try {
          fileBuffer = new Uint8Array(await request.file.arrayBuffer());
        } catch (error) {
          console.error('The selected protocol file could not be read', error);
          toast.add({
            title: createElement(AppMessage, {
              message: messages.importFailed,
            }),
            description: createElement(AppMessage, {
              message: messages.cannotReadSelectedFile,
            }),
            variant: 'destructive',
          });
          return;
        }
      }
      const peekedName = fileBuffer ? await peekProtocolName(fileBuffer) : null;
      const fileLabel =
        request.source === 'file'
          ? (peekedName ?? request.label.replace(/\.netcanvas$/i, ''))
          : '';

      setPendingImports((prev) => [
        ...prev,
        createPendingImport(id, request, fileLabel),
      ]);

      const onProgress = (event: ImportProgressEvent) => {
        setPendingImports((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? { ...entry, phase: event.phase, progress: event.progress }
              : entry,
          ),
        );
      };

      const run = async () => {
        const startedAt = Date.now();
        let result: ImportProtocolResult;
        if (request.source === 'file') {
          result = await importProtocolFromFile(
            request.file,
            onProgress,
            peekedName ?? undefined,
          );
        } else if (request.source === 'development') {
          // Dynamically imported so its module (and the 23MB dev-only video
          // it bundles) is split into a chunk production never fetches; the
          // trigger that reaches this branch is itself DEV-gated in Home.
          const { loadBundledDevelopmentProtocol } =
            await import('./bundledDevelopmentProtocol');
          const bundled = await loadBundledDevelopmentProtocol();
          result = await importBundledProtocol(bundled, onProgress);
        } else {
          const bundled = await loadBundledSampleProtocol();
          result = await importBundledProtocol(bundled, onProgress);
        }

        // Local imports can complete in a few milliseconds — too fast for
        // the installing card to even be perceived. Hold the pending entry
        // (which keeps the loading card in its slot) for a minimum duration
        // so the install reads as a deliberate step.
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_PENDING_VISIBLE_MS) {
          await new Promise((resolve) => {
            setTimeout(resolve, MIN_PENDING_VISIBLE_MS - elapsed);
          });
        }

        if (result.success) {
          if (request.source === 'sample') {
            await updateSettings({ sampleProtocolDismissed: true });
          }
          await onInstalled();
          setPendingImports((prev) => prev.filter((entry) => entry.id !== id));
          // No protocol name or contents — only the anonymous content hash,
          // import source, and whether a schema migration ran.
          analytics.track('protocol_installed', {
            source: request.source,
            migrated: result.migrated,
            protocol_hash: result.hash,
          });
          toast.add({
            title: createElement(AppMessage, {
              message: messages.protocolImported,
            }),
            description: createElement(AppMessage, {
              message: messages.importSuccess,
              values: {
                name: result.protocol.name,
                migrated: String(result.migrated),
              },
            }),
            variant: 'success',
          });
        } else {
          setPendingImports((prev) => prev.filter((entry) => entry.id !== id));
          analytics.track('protocol_install_failed', {
            source: request.source,
            reason: result.error,
          });
          const validationDetails =
            result.error === 'validation-failed'
              ? {
                  issues: result.issues,
                  message: result.message,
                }
              : null;
          toast.add({
            title: createElement(AppMessage, {
              message: messages.importFailed,
            }),
            description: createElement(AppMessage, {
              message: result.localizedMessage.descriptor,
              values: result.localizedMessage.values,
            }),
            variant: 'destructive',
            ...(validationDetails && {
              cancelLabel: createElement(AppMessage, {
                message: messages.viewDetails,
              }),
              onCancel: () =>
                openProtocolValidationDetailsDialog(dialog, validationDetails),
            }),
          });
        }
      };

      window.setTimeout(() => {
        void run().catch((error: unknown) => {
          console.error('Protocol import failed', error);
          setPendingImports((prev) => prev.filter((entry) => entry.id !== id));
          toast.add({
            title: createElement(AppMessage, {
              message: messages.importFailed,
            }),
            description: createElement(AppMessage, {
              message: messages.anUnexpectedErrorOccurred,
            }),
            variant: 'destructive',
          });
        });
      }, IMPORT_START_DELAY_MS);
    },
    [analytics, dialog, onInstalled, toast],
  );

  return { pendingImports, startImport };
}
