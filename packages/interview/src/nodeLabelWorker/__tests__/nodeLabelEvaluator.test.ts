import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import {
  createNodeLabelEvaluator,
  NodeLabelWorkerError,
  type NodeLabelWorkerPort,
} from '../nodeLabelEvaluator';
import { createInProcessNodeLabelWorker } from './inProcessWorker';

const person = (id: string, name: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: 'person',
  [entityAttributesProperty]: { name },
});

const networkOf = (nodes: NcNode[]): NcNetwork => ({
  nodes,
  edges: [],
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
});

const silentWorker = (): NodeLabelWorkerPort & { terminated: boolean } => ({
  terminated: false,
  postMessage: () => undefined,
  addEventListener: () => undefined,
  terminate() {
    this.terminated = true;
  },
});

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof NodeLabelWorkerError) return error;
    throw error;
  }
  throw new Error('Expected a NodeLabelWorkerError.');
};

describe('createNodeLabelEvaluator', () => {
  it('labels nodes with the source it was given', async () => {
    const evaluator = createNodeLabelEvaluator(
      'function nodeLabelWorker({ node, network }) { return node.name + "/" + network.nodes.length; }',
      createInProcessNodeLabelWorker,
    );
    const nodes = [person('a', 'Ada'), person('b', 'Bo')];

    await expect(
      evaluator.label({
        nodes: [nodes[0]!],
        network: networkOf(nodes),
        codebook: undefined,
      }),
    ).resolves.toEqual([{ ok: true, label: 'Ada/2' }]);
    evaluator.dispose();
  });

  it('rejects ready and every label request when the source cannot be used', async () => {
    const evaluator = createNodeLabelEvaluator(
      'const nodeLabelWorker = ;',
      createInProcessNodeLabelWorker,
    );

    const notReady = await errorOf(evaluator.ready);
    expect(notReady.kind).toBe('compile');
    const unlabelled = await errorOf(
      evaluator.label({
        nodes: [],
        network: networkOf([]),
        codebook: undefined,
      }),
    );
    expect(unlabelled.kind).toBe('compile');
  });

  it('reports a function that overruns as a timeout', async () => {
    const evaluator = createNodeLabelEvaluator(
      'function nodeLabelWorker() { while (true) {} }',
      createInProcessNodeLabelWorker,
    );

    const error = await errorOf(
      evaluator.label({
        nodes: [person('a', 'Ada')],
        network: networkOf([]),
        codebook: undefined,
      }),
    );
    expect(error.kind).toBe('timeout');
    evaluator.dispose();
  });

  it('gives up on, and terminates, a worker that stops answering', async () => {
    vi.useFakeTimers();
    try {
      const worker = silentWorker();
      const evaluator = createNodeLabelEvaluator('ignored', () => worker);
      const failed = errorOf(evaluator.ready);

      await vi.advanceTimersByTimeAsync(60_000);

      expect((await failed).kind).toBe('timeout');
      expect(worker.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects what is waiting when disposed, and terminates the worker', async () => {
    const worker = silentWorker();
    const evaluator = createNodeLabelEvaluator('ignored', () => worker);
    const waiting = errorOf(evaluator.ready);
    await Promise.resolve();

    evaluator.dispose();

    expect((await waiting).kind).toBe('disposed');
    expect(worker.terminated).toBe(true);
  });
});
