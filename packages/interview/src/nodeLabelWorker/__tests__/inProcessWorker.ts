import type {
  NodeLabelWorkerRequest,
  NodeLabelWorkerResponse,
} from '../messages';
import type { NodeLabelWorkerPort } from '../nodeLabelEvaluator';
import { createNodeLabelWorkerHandler } from '../workerHandler';

type MessageListener = (event: MessageEvent<NodeLabelWorkerResponse>) => void;

/**
 * Stands in for the Web Worker, which jsdom does not have: the same handler
 * the worker runs, answering on this thread.
 */
export function createInProcessNodeLabelWorker(): NodeLabelWorkerPort {
  const handle = createNodeLabelWorkerHandler();
  const listeners: MessageListener[] = [];
  let terminated = false;

  function addEventListener(type: 'message', listener: MessageListener): void;
  function addEventListener(
    type: 'error',
    listener: (event: ErrorEvent) => void,
  ): void;
  function addEventListener(
    ...args:
      | [type: 'message', listener: MessageListener]
      | [type: 'error', listener: (event: ErrorEvent) => void]
  ) {
    if (args[0] === 'message') listeners.push(args[1]);
  }

  return {
    addEventListener,
    postMessage: (request: NodeLabelWorkerRequest) => {
      void (async () => {
        const data = await handle(request);
        if (terminated) return;
        const event = new MessageEvent('message', { data });
        for (const listener of listeners) listener(event);
      })();
    },
    terminate: () => {
      terminated = true;
    },
  };
}
