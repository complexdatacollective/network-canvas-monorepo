import type { ExportEvent } from '@codaco/network-exporters/events';
import type {
  InterviewExportInput,
  ProtocolExportInput,
} from '@codaco/network-exporters/input';
import type { ExportOptions } from '@codaco/network-exporters/options';
import { getLayoutNodeTypes } from '@codaco/protocol-validation';

import { APP_VERSION } from '../appVersion';
import { getProtocolsByHashes, getSessionsForExport } from '../db/api';
import type { StoredSchema8Protocol } from '../db/types';
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
  const records = await getSessionsForExport(sessionIds);
  if (signal?.aborted) throw new Error(CANCELLED_MESSAGE);
  const sessions: InterviewExportInput[] = records.map((record) => ({
    id: record.id,
    participantIdentifier: record.caseId,
    startTime: new Date(record.startedAt),
    finishTime: record.finishedAt ? new Date(record.finishedAt) : null,
    network: record.network,
    protocolHash: record.protocolHash,
    // Null when the session is unfinished, or was finished before outcomes
    // were recorded, which every schema 8 interview was; never inferred.
    finishOutcome: record.finishedAt ? (record.finishOutcome ?? null) : null,
  }));
  const hashes = [...new Set(records.map((record) => record.protocolHash))];
  const stored = await getProtocolsByHashes(hashes);
  const protocols: Record<string, ProtocolExportInput> = {};
  for (const protocol of stored) {
    protocols[protocol.hash] =
      protocol.schemaVersion === 8
        ? schema8ExportInput(protocol)
        : {
            hash: protocol.hash,
            name: protocol.name,
            codebook: protocol.codebook,
            layoutNodeTypes: getLayoutNodeTypes({
              codebook: protocol.codebook,
              stages: protocol.protocol.stages,
            }),
          };
  }
  return { sessions, protocols };
}

/**
 * The export input of a schema 8 protocol. It is exported as it was
 * collected, never converted to schema 9: the exporter reads only what the two
 * schemas share (entity types, variable names, types and options), and its own
 * handling of each variable type covers schema 8's. The one difference it
 * cannot read is a layout: schema 8 declared one as a node variable of type
 * `layout`, which is handed over as a layout of the codebook, held by the node
 * types that declared it, so its position columns stay in the export.
 */
function schema8ExportInput(
  protocol: StoredSchema8Protocol,
): ProtocolExportInput {
  const layouts: Record<string, { name: string }> = {};
  const layoutNodeTypes: Record<string, string[]> = {};
  const nodeTypes = protocol.codebook.node;
  const node =
    nodeTypes === undefined || nodeTypes === null
      ? undefined
      : Object.fromEntries(
          Object.entries(nodeTypes).map(([type, definition]) => {
            if (definition.variables === undefined) return [type, definition];
            const variables = Object.fromEntries(
              Object.entries(definition.variables).filter(([id, variable]) => {
                if (
                  typeof variable !== 'object' ||
                  variable === null ||
                  !('type' in variable) ||
                  variable.type !== 'layout'
                ) {
                  return true;
                }
                layouts[id] ??= {
                  name:
                    'name' in variable && typeof variable.name === 'string'
                      ? variable.name
                      : id,
                };
                (layoutNodeTypes[id] ??= []).push(type);
                return false;
              }),
            );
            return [type, { ...definition, variables }];
          }),
        );
  const converted: unknown = {
    ...protocol.codebook,
    ...(node === undefined ? {} : { node }),
    ...(Object.keys(layouts).length === 0 ? {} : { layouts }),
  };
  return {
    hash: protocol.hash,
    name: protocol.name,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema 8 and current codebook types differ only in fields the exporter never reads, once layout variables are moved to layouts
    codebook: converted as ProtocolExportInput['codebook'],
    layoutNodeTypes,
  };
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
    worker.addEventListener(
      'message',
      (message: MessageEvent<ExportWorkerMessage>) => {
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
      },
    );
    worker.addEventListener('error', (event) => {
      settle();
      reject(
        new Error(
          event.message.length > 0 ? event.message : 'Export worker failed',
        ),
      );
    });
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
