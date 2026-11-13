/**
 * An entity as a node label worker reads it: its attributes by variable name,
 * with `networkCanvasId` and `networkCanvasType` identifying it. The shape
 * Interviewer Classic gave its workers, so a worker written for it reads the
 * same properties here.
 */
export type WorkerEntity = Readonly<Record<string, unknown>>;

export type WorkerNetwork = Readonly<{
  nodes: readonly WorkerEntity[];
  edges: readonly WorkerEntity[];
  ego: WorkerEntity;
}>;

/**
 * What the worker made of one node: a label, or why it has none. A node
 * without one keeps the label it would have had without a worker.
 */
export type NodeLabelResult =
  | Readonly<{ ok: true; label: string }>
  /** The function threw, or the promise it returned rejected. */
  | Readonly<{ ok: false; reason: 'threw'; message: string }>
  /** The function returned something other than text, or blank text. */
  | Readonly<{ ok: false; reason: 'no-label' }>;

/**
 * Why the worker produced nothing at all.
 *
 * - `compile`: the source does not parse, fails as it loads, or declares no
 *   `nodeLabelWorker` function.
 * - `timeout`: the function ran past its time limit.
 * - `unsettled`: a promise the function returned never settled.
 * - `crashed`: the worker itself failed.
 */
export type NodeLabelFailure = Readonly<{
  kind: 'compile' | 'timeout' | 'unsettled' | 'crashed';
  message: string;
}>;

export type NodeLabelWorkerRequest =
  | Readonly<{ id: number; type: 'init'; source: string }>
  | Readonly<{
      id: number;
      type: 'label';
      nodes: readonly WorkerEntity[];
      network: WorkerNetwork;
    }>;

export type NodeLabelWorkerResponse =
  | Readonly<{ id: number; ok: true; results: readonly NodeLabelResult[] }>
  | Readonly<{ id: number; ok: false; failure: NodeLabelFailure }>;
