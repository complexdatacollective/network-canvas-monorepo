import type { Codebook } from '@codaco/protocol-validation';
import {
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import {
  createNodeLabelEvaluator,
  type NodeLabelEvaluator,
  NodeLabelWorkerError,
} from './nodeLabelEvaluator';

type NodeId = NcNode[typeof entityPrimaryKeyProperty];

type Context = { network: NcNetwork; codebook: Codebook | undefined };

type Watched = { node: NcNode; watchers: number };

/**
 * The labels a protocol's node label worker gives the interview's nodes.
 *
 * A label depends on the whole network, so every node in the network is
 * labelled again, in one request, each time the network changes. A node shown
 * from outside it (a roster entry, a panel's external data) is labelled while
 * something watches it, or when its label is asked for.
 *
 * Reading never waits. Until the worker has answered for a node, and whenever
 * it gives that node no label, `peek` returns nothing and the caller shows
 * the standard label. A label already held stays while a newer one is worked
 * out, so a node's label does not blink on every change to the network.
 *
 * When the worker fails as a whole (its source does not compile, it overruns,
 * it crashes) it is stopped and every node keeps its standard label for the
 * rest of the interview: one broken script must not cost the participant
 * their place.
 */
export class NodeLabelStore {
  private readonly source: string;
  private readonly createEvaluator: (source: string) => NodeLabelEvaluator;
  private evaluator: NodeLabelEvaluator | undefined;
  private context: Context | undefined;
  // Replaced, never changed, so a reader can tell when a label has.
  private labels: ReadonlyMap<NodeId, string> = new Map();
  private readonly watched = new Map<NodeId, Watched>();
  // The node objects whose labels reflect the current network.
  private current = new WeakSet<NcNode>();
  private readonly queue = new Map<NodeId, NcNode>();
  private readonly listeners = new Set<() => void>();
  private flushing = false;
  private scheduled = false;
  private failed = false;

  constructor(
    source: string,
    createEvaluator: (source: string) => NodeLabelEvaluator = (workerSource) =>
      createNodeLabelEvaluator(workerSource),
  ) {
    this.source = source;
    this.createEvaluator = createEvaluator;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * The worker's labels by node id. A node missing from it shows its standard
   * label.
   */
  getLabels = () => this.labels;

  /** Keeps `node`'s label up to date until the returned function is called. */
  watch = (node: NcNode) => {
    const id = node[entityPrimaryKeyProperty];
    const entry = this.watched.get(id);
    if (entry) {
      entry.node = node;
      entry.watchers += 1;
    } else {
      this.watched.set(id, { node, watchers: 1 });
    }
    this.request(node);

    return () => {
      const held = this.watched.get(id);
      if (!held) return;
      held.watchers -= 1;
      if (held.watchers === 0) this.watched.delete(id);
    };
  };

  /** The network changed: every label held may have, too. */
  setContext(network: NcNetwork, codebook: Codebook | undefined) {
    this.context = { network, codebook };
    this.current = new WeakSet();
    for (const node of network.nodes) this.request(node);
    for (const { node } of this.watched.values()) this.request(node);
    // Whatever was asked for before there was a network to label against.
    this.schedule();
  }

  /** Stops the worker. A later request starts it again. */
  stop() {
    this.evaluator?.dispose();
    this.evaluator = undefined;
    this.queue.clear();
    this.current = new WeakSet();
  }

  /** Asks the worker for `node`'s label, unless it is up to date. */
  request = (node: NcNode) => {
    if (this.failed || this.current.has(node)) return;
    this.queue.set(node[entityPrimaryKeyProperty], node);
    this.schedule();
  };

  private schedule() {
    if (this.scheduled || this.flushing) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.flush();
    });
  }

  private async flush() {
    if (this.flushing || this.failed) return;
    this.flushing = true;
    try {
      while (this.queue.size > 0 && this.context) {
        const nodes = [...this.queue.values()];
        this.queue.clear();
        const { network, codebook } = this.context;
        this.evaluator ??= this.createEvaluator(this.source);
        const evaluator = this.evaluator;

        const results = await evaluator.label({ nodes, network, codebook });
        // Stopped while waiting: these answer a worker no longer in use.
        if (this.evaluator !== evaluator) return;

        const labels = new Map(this.labels);
        nodes.forEach((node, index) => {
          const id = node[entityPrimaryKeyProperty];
          const result = results[index];
          const label = result?.ok ? result.label : undefined;
          // Answered against a network since replaced: shown, as the best
          // there is, until the request the change queued is answered.
          if (this.context?.network === network) this.current.add(node);
          if (label === undefined) labels.delete(id);
          else labels.set(id, label);
        });
        this.publish(labels);
      }
    } catch (error) {
      if (error instanceof NodeLabelWorkerError && error.kind === 'disposed') {
        return;
      }
      this.fail(error);
    } finally {
      this.flushing = false;
    }
  }

  private fail(error: unknown) {
    this.failed = true;
    this.evaluator?.dispose();
    this.evaluator = undefined;
    this.queue.clear();
    // eslint-disable-next-line no-console
    console.warn(
      'The node label worker failed. Nodes show their standard labels.',
      error,
    );
    this.publish(new Map());
  }

  private publish(labels: ReadonlyMap<NodeId, string>) {
    const unchanged =
      labels.size === this.labels.size &&
      [...labels].every(([id, label]) => this.labels.get(id) === label);
    if (unchanged) return;
    this.labels = labels;
    for (const listener of this.listeners) listener();
  }
}
