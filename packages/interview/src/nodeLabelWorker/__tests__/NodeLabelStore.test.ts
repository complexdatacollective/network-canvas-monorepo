import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import type { NodeLabelResult } from '../messages';
import {
  type NodeLabelEvaluator,
  type NodeLabelRequest,
  NodeLabelWorkerError,
} from '../nodeLabelEvaluator';
import { NodeLabelStore } from '../NodeLabelStore';

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

const idOf = (node: NcNode) => node[entityPrimaryKeyProperty];

const nameOf = (node: NcNode) => {
  const { name } = node[entityAttributesProperty];
  return typeof name === 'string' ? name : '';
};

/**
 * An evaluator whose answers the test gives, one request at a time. Labels
 * each node `<name> of <network size>` by default.
 */
function fakeEvaluator() {
  const requests: NodeLabelRequest[] = [];
  let answer: (request: NodeLabelRequest) => Promise<NodeLabelResult[]> = (
    request,
  ) =>
    Promise.resolve(
      request.nodes.map((node) => ({
        ok: true,
        label: `${nameOf(node)} of ${request.network.nodes.length}`,
      })),
    );
  const dispose = vi.fn();
  const created = vi.fn((): NodeLabelEvaluator => ({
    ready: Promise.resolve(),
    label: (request) => {
      requests.push(request);
      return answer(request);
    },
    dispose,
  }));

  return {
    create: created,
    requests,
    dispose,
    answerWith: (next: typeof answer) => {
      answer = next;
    },
  };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NodeLabelStore', () => {
  it('labels every node in the network in one request', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const nodes = [person('a', 'Ada'), person('b', 'Bo')];

    store.setContext(networkOf(nodes), undefined);
    expect(store.getLabels().size).toBe(0);
    await settle();

    expect(evaluator.create).toHaveBeenCalledExactlyOnceWith('source');
    expect(evaluator.requests).toHaveLength(1);
    expect(store.getLabels()).toEqual(
      new Map([
        ['a', 'Ada of 2'],
        ['b', 'Bo of 2'],
      ]),
    );
  });

  it('labels every node again when the network changes, keeping the old label meanwhile', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const ada = person('a', 'Ada');
    store.setContext(networkOf([ada]), undefined);
    await settle();

    store.setContext(networkOf([ada, person('b', 'Bo')]), undefined);
    expect(store.getLabels().get('a')).toBe('Ada of 1');
    await settle();

    expect(store.getLabels().get('a')).toBe('Ada of 2');
    expect(store.getLabels().get('b')).toBe('Bo of 2');
  });

  it('tells subscribers when a label changes, and only then', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const listener = vi.fn();
    store.subscribe(listener);
    const network = networkOf([person('a', 'Ada')]);

    store.setContext(network, undefined);
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    const labels = store.getLabels();

    store.setContext({ ...network }, undefined);
    await settle();
    expect(evaluator.requests).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getLabels()).toBe(labels);
  });

  it('labels a node outside the network while it is watched', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const external = person('x', 'Xi');

    // Watched before there is a network, as a child's effect runs first.
    const unwatch = store.watch(external);
    await settle();
    expect(evaluator.requests).toHaveLength(0);

    store.setContext(networkOf([]), undefined);
    await settle();
    expect(store.getLabels().get(idOf(external))).toBe('Xi of 0');

    store.setContext(networkOf([person('a', 'Ada')]), undefined);
    await settle();
    expect(store.getLabels().get(idOf(external))).toBe('Xi of 1');

    unwatch();
    store.setContext(networkOf([]), undefined);
    await settle();
    expect(store.getLabels().get(idOf(external))).toBe('Xi of 1');
  });

  it('asks once for a node requested many times', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const external = person('x', 'Xi');
    store.setContext(networkOf([]), undefined);

    store.request(external);
    store.request(external);
    await settle();
    store.request(external);
    await settle();

    expect(evaluator.requests.flatMap((request) => request.nodes)).toEqual([
      external,
    ]);
  });

  it('holds no label for a node the worker gives none', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const ada = person('a', 'Ada');
    store.setContext(networkOf([ada]), undefined);
    await settle();

    evaluator.answerWith((request) =>
      Promise.resolve(
        request.nodes.map(() => ({ ok: false, reason: 'no-label' })),
      ),
    );
    store.setContext(networkOf([ada]), undefined);
    await settle();

    expect(store.getLabels().has('a')).toBe(false);
  });

  it('drops every label and stops asking when the worker fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const ada = person('a', 'Ada');
    store.setContext(networkOf([ada]), undefined);
    await settle();
    const listener = vi.fn();
    store.subscribe(listener);

    evaluator.answerWith(() =>
      Promise.reject(new NodeLabelWorkerError('timeout', 'Too slow.')),
    );
    store.setContext(networkOf([ada]), undefined);
    await settle();

    expect(store.getLabels().size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(evaluator.dispose).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    store.setContext(networkOf([ada]), undefined);
    await settle();
    expect(evaluator.requests).toHaveLength(2);
  });

  it('starts the worker again after being stopped', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    const network = networkOf([person('a', 'Ada')]);
    store.setContext(network, undefined);
    await settle();

    store.stop();
    expect(evaluator.dispose).toHaveBeenCalledTimes(1);
    store.setContext(network, undefined);
    await settle();

    expect(evaluator.create).toHaveBeenCalledTimes(2);
    expect(evaluator.requests).toHaveLength(2);
  });

  it('ignores an answer that arrives after it was stopped', async () => {
    const evaluator = fakeEvaluator();
    const store = new NodeLabelStore('source', evaluator.create);
    let answerLate: (results: NodeLabelResult[]) => void = () => undefined;
    evaluator.answerWith(
      () =>
        new Promise((resolve) => {
          answerLate = resolve;
        }),
    );
    store.setContext(networkOf([person('a', 'Ada')]), undefined);
    await settle();

    store.stop();
    answerLate([{ ok: true, label: 'late' }]);
    await settle();

    expect(store.getLabels().size).toBe(0);
  });
});
