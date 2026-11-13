// Library-build-only counterpart to createNodeLabelWorker.ts — see
// `canvas/createAutoLayoutWorker.inline.ts`. Never imported from source.
import NodeLabelWorker from './nodeLabel.worker.ts?worker&inline';

export function createNodeLabelWorker(): Worker {
  return new NodeLabelWorker();
}
