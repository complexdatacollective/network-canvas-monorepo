import { useCallback, useState } from 'react';

import { useToast } from '@codaco/fresco-ui/Toast';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { updateSettings } from '~/lib/db/api';

import {
  type ImportPhase,
  type ImportProgressEvent,
  type ImportProtocolResult,
  importProtocolFromFile,
  importProtocolFromUrl,
  peekProtocolName,
} from './importProtocol';
import { SAMPLE_PROTOCOL } from './sampleProtocol';

export type ImportRequest =
  | { source: 'file'; file: File; label: string }
  | { source: 'url'; url: string; label: string };

// An in-flight protocol import, tracked by this hook and rendered by
// ProtocolDeck as a loading-state DeckCard that fills in as the import
// progresses.
export type PendingImport = {
  id: string;
  label: string;
  source: 'file' | 'url' | 'sample';
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

function createPendingImport(
  id: string,
  request: ImportRequest | { source: 'sample' },
  fileLabel: string,
): PendingImport {
  if (request.source === 'file') {
    return { id, label: fileLabel, source: 'file', phase: 'extracting' };
  }
  if (request.source === 'url') {
    return {
      id,
      label: request.label.replace(/\.netcanvas$/i, ''),
      source: 'url',
      phase: 'fetching',
    };
  }
  return {
    id,
    label: SAMPLE_PROTOCOL.name,
    source: 'sample',
    phase: 'fetching',
  };
}

type UseProtocolImportOptions = {
  // Called after a successful install is persisted, before the pending
  // card is removed, so the real protocol card is ready to take its slot.
  onInstalled: () => Promise<void> | void;
};

export function useProtocolImport({ onInstalled }: UseProtocolImportOptions) {
  const toast = useToast();
  const analytics = useAnalytics();
  const [pendingImports, setPendingImports] = useState<PendingImport[]>([]);

  const startImport = useCallback(
    async (request: ImportRequest | { source: 'sample' }) => {
      const id = crypto.randomUUID();

      const fileBuffer =
        request.source === 'file'
          ? new Uint8Array(await request.file.arrayBuffer())
          : null;
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
        } else if (request.source === 'url') {
          result = await importProtocolFromUrl(request.url, onProgress);
        } else {
          result = await importProtocolFromUrl(
            SAMPLE_PROTOCOL.url,
            onProgress,
            SAMPLE_PROTOCOL.name,
          );
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
            title: 'Protocol imported',
            description: result.migrated
              ? `${result.protocol.name} was migrated to the current schema.`
              : `${result.protocol.name} is ready to use.`,
            variant: 'success',
          });
        } else {
          setPendingImports((prev) => prev.filter((entry) => entry.id !== id));
          analytics.track('protocol_install_failed', {
            source: request.source,
            reason: result.error,
          });
          toast.add({
            title: 'Import failed',
            description: result.message,
            variant: 'destructive',
          });
        }
      };

      window.setTimeout(() => void run(), IMPORT_START_DELAY_MS);
    },
    [analytics, onInstalled, toast],
  );

  return { pendingImports, startImport };
}
