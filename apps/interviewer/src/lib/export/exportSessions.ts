import type { ExportEvent } from '@codaco/network-exporters/events';
import type {
  InterviewExportInput,
  ProtocolExportInput,
} from '@codaco/network-exporters/input';
import type { ExportOptions } from '@codaco/network-exporters/options';

import { APP_VERSION } from '../appVersion';
import { getProtocolsByHashes, getSessionsByIds } from '../db/api';
import {
  type ExportPipelineData,
  type ExportRun,
  runPipelineWithData,
} from './exportPipelineRunner';
import type { ExportWorkerMessage, ExportWorkerStart } from './exportWorker';

export type ExportInvocation = {
  options: ExportOptions;
  sessionIds: string[];
  onEvent?: (event: ExportEvent) => void;
  // Aborting cancels the export: the worker (which holds all pipeline state)
  // is terminated, or the fallback pipeline's Effect fiber is interrupted.
  // Callers that abort should treat the rejection as a cancellation.
  signal?: AbortSignal;
};

const CANCELLED_MESSAGE = 'Export was cancelled';

// The fetch (and field-level decryption) stage stays on the main thread: the
// vault DEK never crosses the worker boundary; only decrypted, cloneable
// export inputs do. Checks the signal between the two reads so cancelling
// mid-fetch stops before the protocol lookup/decryption begins.
async function fetchExportInputs(
  sessionIds: string[],
  signal?: AbortSignal,
): Promise<ExportPipelineData> {
  const records = await getSessionsByIds(sessionIds);
  if (signal?.aborted) throw new Error(CANCELLED_MESSAGE);
  const sessions: InterviewExportInput[] = records.map((record) => ({
    id: record.id,
    participantIdentifier: record.caseId,
    startTime: new Date(record.startedAt),
    finishTime: record.finishedAt ? new Date(record.finishedAt) : null,
    network: record.network,
    protocolHash: record.protocolHash,
  }));
  const hashes = [...new Set(records.map((record) => record.protocolHash))];
  const stored = await getProtocolsByHashes(hashes);
  const protocols: Record<string, ProtocolExportInput> = {};
  for (const protocol of stored) {
    protocols[protocol.hash] = {
      hash: protocol.hash,
      name: protocol.name,
      codebook: protocol.codebook,
    };
  }
  return { sessions, protocols };
}

function runOnWorker({
  worker,
  data,
  options,
  onEvent,
  signal,
}: {
  worker: Worker;
  data: ExportPipelineData;
  options: ExportOptions;
  onEvent?: (event: ExportEvent) => void;
  signal?: AbortSignal;
}): Promise<ExportRun> {
  return new Promise<ExportRun>((resolve, reject) => {
    // Terminating the worker frees the pipeline and everything it buffered in
    // one step — there is no in-band cancellation message.
    const onAbort = () => {
      worker.terminate();
      reject(new Error(CANCELLED_MESSAGE));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const settle = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    worker.onmessage = (message: MessageEvent<ExportWorkerMessage>) => {
      const payload = message.data;
      if (payload.type === 'event') {
        onEvent?.(payload.event);
        return;
      }
      settle();
      if (payload.type === 'done') {
        resolve({
          result: payload.result,
          blob: payload.blob,
          fileName: payload.fileName,
        });
        return;
      }
      const error = new Error(payload.message);
      error.stack = payload.stack;
      reject(error);
    };
    worker.onerror = (event) => {
      settle();
      reject(
        new Error(
          event.message.length > 0 ? event.message : 'Export worker failed',
        ),
      );
    };
    const start: ExportWorkerStart = { type: 'start', data, options };
    worker.postMessage(start);
  });
}

// The CPU-heavy generation and ZIP stages run in a dedicated Web Worker so
// the export dialog's progress UI stays smooth; environments without Worker
// (jsdom, unit tests) run the same pipeline on the main thread.
export async function runExport({
  options,
  sessionIds,
  onEvent,
  signal,
}: ExportInvocation): Promise<ExportRun> {
  // An already-cancelled export must not start the database reads at all.
  if (signal?.aborted) throw new Error(CANCELLED_MESSAGE);
  const data = await fetchExportInputs(sessionIds, signal);
  if (signal?.aborted) throw new Error(CANCELLED_MESSAGE);

  if (typeof Worker === 'function') {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./exportWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      // Construction can fail under restrictive embedding; fall through to
      // the main-thread pipeline rather than failing the export.
      worker = null;
    }
    if (worker) {
      return runOnWorker({ worker, data, options, onEvent, signal });
    }
  }

  return runPipelineWithData({ data, options, onEvent, signal });
}

export function buildExportOptions(args: {
  exportGraphML: boolean;
  exportCSV: boolean;
  useScreenLayoutCoordinates: boolean;
  screenLayoutHeight: number;
  screenLayoutWidth: number;
}): ExportOptions {
  return {
    exportGraphML: args.exportGraphML,
    exportCSV: args.exportCSV,
    globalOptions: {
      useScreenLayoutCoordinates: args.useScreenLayoutCoordinates,
      screenLayoutHeight: args.screenLayoutHeight,
      screenLayoutWidth: args.screenLayoutWidth,
    },
    appVersion: APP_VERSION,
    commitHash: 'interviewer',
  };
}
