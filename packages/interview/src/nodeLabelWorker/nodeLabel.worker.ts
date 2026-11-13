// The Web Worker a protocol's node label worker runs in, so that labelling a
// large network never holds up the interview. The source itself runs inside
// the sandbox this hosts (see `sandbox.ts`), not in this worker's own scope.
import type { NodeLabelWorkerRequest } from './messages';
import { createNodeLabelWorkerHandler } from './workerHandler';

const handle = createNodeLabelWorkerHandler();

self.addEventListener(
  'message',
  (event: MessageEvent<NodeLabelWorkerRequest>) => {
    void (async () => {
      self.postMessage(await handle(event.data));
    })();
  },
);
