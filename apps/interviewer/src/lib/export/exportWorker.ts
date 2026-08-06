import type { ExportEvent } from '@codaco/network-exporters/events';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type { ExportReturn } from '@codaco/network-exporters/output';

import {
  type ExportPipelineData,
  runPipelineWithData,
} from './exportPipelineRunner';

// The message protocol between runExport (client) and this worker. Both sides
// import these types from here; only the client constructs the Worker.
export type ExportWorkerStart = {
  type: 'start';
  data: ExportPipelineData;
  options: ExportOptions;
};

export type ExportWorkerMessage =
  | { type: 'event'; event: ExportEvent }
  | {
      type: 'done';
      result: ExportReturn;
      blob: Blob | null;
      fileName: string | null;
    }
  | { type: 'error'; message: string; stack: string };

// Shadows the DOM lib's `self: Window` with the worker-shaped surface this
// module actually runs against, keeping the file type-checkable inside the
// app's DOM-lib TS program without `as` assertions.
declare const self: {
  onmessage: ((message: MessageEvent<ExportWorkerStart>) => void) | null;
  postMessage: (message: ExportWorkerMessage) => void;
};

// Cancellation has no in-band message: the client simply terminates the
// worker, which frees the pipeline and everything it buffered outright.
self.onmessage = (message) => {
  const payload = message.data;
  if (payload.type !== 'start') return;
  void (async () => {
    try {
      const run = await runPipelineWithData({
        data: payload.data,
        options: payload.options,
        onEvent: (event) => {
          self.postMessage({ type: 'event', event });
        },
      });
      self.postMessage({
        type: 'done',
        result: run.result,
        blob: run.blob,
        fileName: run.fileName,
      });
    } catch (cause) {
      self.postMessage({
        type: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
        stack:
          cause instanceof Error
            ? (cause.stack ?? cause.message)
            : String(cause),
      });
    }
  })();
};
