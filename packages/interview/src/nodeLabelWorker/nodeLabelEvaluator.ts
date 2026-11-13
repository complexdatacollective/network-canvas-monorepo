import type { Codebook } from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import type {
  NodeLabelFailure,
  NodeLabelResult,
  NodeLabelWorkerRequest,
  NodeLabelWorkerResponse,
} from './messages';
import { toWorkerNetwork, toWorkerNode } from './workerEntities';

// Loading includes fetching the engine, which a slow connection can stretch.
const LOAD_TIMEOUT_MS = 20_000;
// The engine stops a function that overruns well before this. This is for a
// worker that has stopped answering altogether.
const LABEL_TIMEOUT_MS = 5000;

/** Why a node label worker produced nothing (see `NodeLabelFailure`). */
export class NodeLabelWorkerError extends Error {
  readonly kind: NodeLabelFailure['kind'] | 'disposed';

  constructor(kind: NodeLabelWorkerError['kind'], message: string) {
    super(message);
    this.name = 'NodeLabelWorkerError';
    this.kind = kind;
  }
}

export type NodeLabelRequest = Readonly<{
  /** The nodes to label, which need not be in the network. */
  nodes: readonly NcNode[];
  network: NcNetwork;
  codebook: Codebook | undefined;
}>;

export type NodeLabelEvaluator = {
  /**
   * Settles once the source has loaded: resolves when it can be used, rejects
   * with a `NodeLabelWorkerError` of kind `compile` when it cannot.
   */
  ready: Promise<void>;
  /**
   * What the worker makes of each node, in order. Rejects with a
   * `NodeLabelWorkerError` when it produces nothing at all.
   */
  label: (request: NodeLabelRequest) => Promise<readonly NodeLabelResult[]>;
  /** Stops the worker. Everything still waiting on it rejects. */
  dispose: () => void;
};

/** The part of a Web Worker the evaluator uses. */
export type NodeLabelWorkerPort = {
  postMessage: (message: NodeLabelWorkerRequest) => void;
  terminate: () => void;
  addEventListener: {
    (
      type: 'message',
      listener: (event: MessageEvent<NodeLabelWorkerResponse>) => void,
    ): void;
    (type: 'error', listener: (event: ErrorEvent) => void): void;
  };
};

type Pending = {
  resolve: (results: readonly NodeLabelResult[]) => void;
  reject: (error: NodeLabelWorkerError) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Unsent<T> = T extends unknown ? Omit<T, 'id'> : never;

const defaultCreateWorker = async () => {
  // Imported on demand: in the published build this module carries the whole
  // worker, engine included, which only a protocol with a worker needs.
  const { createNodeLabelWorker } = await import('./createNodeLabelWorker.ts');
  return createNodeLabelWorker();
};

/**
 * Runs a node label worker's source in a Web Worker, sandboxed (see
 * `sandbox.ts`), and asks it for labels. One evaluator runs one source; make
 * another to run a changed one.
 */
export function createNodeLabelEvaluator(
  source: string,
  createWorker: () =>
    | Promise<NodeLabelWorkerPort>
    | NodeLabelWorkerPort = defaultCreateWorker,
): NodeLabelEvaluator {
  let worker: NodeLabelWorkerPort | undefined;
  let stopped: NodeLabelWorkerError | undefined;
  let nextId = 0;
  const pending = new Map<number, Pending>();

  const stop = (error: NodeLabelWorkerError) => {
    stopped ??= error;
    worker?.terminate();
    worker = undefined;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(stopped);
    }
    pending.clear();
  };

  const send = (message: Unsent<NodeLabelWorkerRequest>, timeoutMs: number) =>
    new Promise<readonly NodeLabelResult[]>((resolve, reject) => {
      if (stopped) {
        reject(stopped);
        return;
      }
      if (!worker) {
        reject(
          new NodeLabelWorkerError('crashed', 'The worker is not running.'),
        );
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        stop(
          new NodeLabelWorkerError('timeout', 'The worker stopped answering.'),
        );
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ ...message, id });
    });

  const receive = (response: NodeLabelWorkerResponse) => {
    const waiting = pending.get(response.id);
    if (!waiting) return;
    pending.delete(response.id);
    clearTimeout(waiting.timer);
    if (response.ok) {
      waiting.resolve(response.results);
    } else {
      waiting.reject(
        new NodeLabelWorkerError(
          response.failure.kind,
          response.failure.message,
        ),
      );
    }
  };

  const load = async () => {
    const created = await createWorker();
    if (stopped) {
      created.terminate();
      throw stopped;
    }
    worker = created;
    created.addEventListener('message', (event) => {
      receive(event.data);
    });
    created.addEventListener('error', (event) => {
      stop(
        new NodeLabelWorkerError(
          'crashed',
          event.message || 'The worker failed to start.',
        ),
      );
    });
    try {
      await send({ type: 'init', source }, LOAD_TIMEOUT_MS);
    } catch (error) {
      // A source that cannot be used answers nothing asked of it afterwards.
      if (error instanceof NodeLabelWorkerError) stop(error);
      throw error;
    }
  };

  const ready = load();
  // `label` reports a failed load to whoever asks for labels; a caller that
  // never asks must not leave an unhandled rejection behind.
  ready.catch(() => undefined);

  return {
    ready,
    label: async ({ nodes, network, codebook }) => {
      await ready;
      return send(
        {
          type: 'label',
          nodes: nodes.map((node) => toWorkerNode(node, codebook)),
          network: toWorkerNetwork(network, codebook),
        },
        LABEL_TIMEOUT_MS,
      );
    },
    dispose: () => {
      stop(new NodeLabelWorkerError('disposed', 'The worker was stopped.'));
    },
  };
}
