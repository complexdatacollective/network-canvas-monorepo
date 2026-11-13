import { describe, expect, it } from 'vitest';

import type { WorkerNetwork } from '../messages';
import { createNodeLabelSandbox, NodeLabelSandboxError } from '../sandbox';

const emptyNetwork: WorkerNetwork = { nodes: [], edges: [], ego: {} };

const failureOf = async (run: () => unknown) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof NodeLabelSandboxError) return error.failure;
    throw error;
  }
  throw new Error('Expected the sandbox to fail.');
};

describe('createNodeLabelSandbox', () => {
  it('labels each node with what the function returns', async () => {
    const sandbox = await createNodeLabelSandbox(
      'function nodeLabelWorker({ node }) { return node.name.toUpperCase(); }',
    );

    expect(
      sandbox.label([{ name: 'ada' }, { name: 'bo' }], emptyNetwork),
    ).toEqual([
      { ok: true, label: 'ADA' },
      { ok: true, label: 'BO' },
    ]);
    sandbox.dispose();
  });

  it('hands the function the whole network', async () => {
    const sandbox = await createNodeLabelSandbox(`
      function nodeLabelWorker({ node, network }) {
        const degree = network.edges.filter(
          (edge) => edge.from === node.networkCanvasId || edge.to === node.networkCanvasId,
        ).length;
        return node.name + ' (' + degree + ' of ' + network.nodes.length + ', ' + network.ego.role + ')';
      }
    `);
    const nodes = [
      { networkCanvasId: 'a', name: 'Ada' },
      { networkCanvasId: 'b', name: 'Bo' },
    ];

    expect(
      sandbox.label(nodes, {
        nodes,
        edges: [{ from: 'a', to: 'b' }],
        ego: { role: 'ego' },
      })[0],
    ).toEqual({ ok: true, label: 'Ada (1 of 2, ego)' });
    sandbox.dispose();
  });

  it('accepts a promise, including one resolved from a timer', async () => {
    const sandbox = await createNodeLabelSandbox(`
      function nodeLabelWorker({ node }) {
        return new Promise((resolve) => {
          setTimeout(() => resolve('later ' + node.name), 100);
        });
      }
    `);

    expect(sandbox.label([{ name: 'Ada' }], emptyNetwork)).toEqual([
      { ok: true, label: 'later Ada' },
    ]);
    sandbox.dispose();
  });

  it('tolerates console calls', async () => {
    const sandbox = await createNodeLabelSandbox(
      "function nodeLabelWorker({ node }) { console.log(node); return 'ok'; }",
    );

    expect(sandbox.label([{}], emptyNetwork)).toEqual([
      { ok: true, label: 'ok' },
    ]);
    sandbox.dispose();
  });

  it('reports a node the function throws on, and labels the others', async () => {
    const sandbox = await createNodeLabelSandbox(`
      function nodeLabelWorker({ node }) {
        if (!node.name) throw new Error('No name');
        return node.name;
      }
    `);

    expect(sandbox.label([{}, { name: 'Bo' }], emptyNetwork)).toEqual([
      { ok: false, reason: 'threw', message: 'No name' },
      { ok: true, label: 'Bo' },
    ]);
    sandbox.dispose();
  });

  it.each([
    ['a number', 'return 4;'],
    ['nothing', 'return;'],
    ['a blank string', "return '  ';"],
    ['an object', 'return { label: node.name };'],
  ])('gives no label when the function returns %s', async (_, body) => {
    const sandbox = await createNodeLabelSandbox(
      `function nodeLabelWorker({ node }) { ${body} }`,
    );

    expect(sandbox.label([{ name: 'Ada' }], emptyNetwork)).toEqual([
      { ok: false, reason: 'no-label' },
    ]);
    sandbox.dispose();
  });

  it('rejects a source with a syntax error, naming the line', async () => {
    const failure = await failureOf(() =>
      createNodeLabelSandbox('function nodeLabelWorker() {\n  return (;\n}'),
    );

    expect(failure.kind).toBe('compile');
    expect(failure.message).toContain('SyntaxError');
    expect(failure.message).toContain('line 2');
  });

  it('rejects a source that declares no nodeLabelWorker function', async () => {
    const failure = await failureOf(() =>
      createNodeLabelSandbox('function label() { return "x"; }'),
    );

    expect(failure).toEqual({
      kind: 'compile',
      message: expect.stringContaining('nodeLabelWorker'),
    });
  });

  it('stops a source that never finishes loading', async () => {
    const failure = await failureOf(() =>
      createNodeLabelSandbox('while (true) {}'),
    );

    expect(failure.kind).toBe('timeout');
  });

  it('stops a function that never returns, and can be used again', async () => {
    const sandbox = await createNodeLabelSandbox(`
      function nodeLabelWorker({ node }) {
        while (node.loop) {}
        return 'done';
      }
    `);

    const failure = await failureOf(() =>
      sandbox.label([{ loop: true }], emptyNetwork),
    );
    expect(failure.kind).toBe('timeout');
    expect(sandbox.label([{ loop: false }], emptyNetwork)).toEqual([
      { ok: true, label: 'done' },
    ]);
    sandbox.dispose();
  });

  it('reports a promise that never settles', async () => {
    const sandbox = await createNodeLabelSandbox(
      'function nodeLabelWorker() { return new Promise(() => {}); }',
    );

    const failure = await failureOf(() => sandbox.label([{}], emptyNetwork));
    expect(failure.kind).toBe('unsettled');
    sandbox.dispose();
  });

  it('gives the function nothing of the host to reach', async () => {
    const sandbox = await createNodeLabelSandbox(`
      function nodeLabelWorker() {
        return [
          typeof fetch, typeof XMLHttpRequest, typeof indexedDB, typeof self,
          typeof window, typeof importScripts, typeof postMessage, typeof process,
          typeof require, typeof localStorage, typeof WebSocket,
        ].join(',');
      }
    `);

    expect(sandbox.label([{}], emptyNetwork)).toEqual([
      {
        ok: true,
        label: Array.from({ length: 11 }, () => 'undefined').join(','),
      },
    ]);
    sandbox.dispose();
  });

  it('does not let one call change what the next one sees', async () => {
    const sandbox = await createNodeLabelSandbox(`
      function nodeLabelWorker({ node, network }) {
        network.nodes.push(node);
        node.seen = true;
        return String(network.nodes.length);
      }
    `);
    const network = { ...emptyNetwork, nodes: [{ name: 'Ada' }] };

    expect(sandbox.label([{}], network)).toEqual([{ ok: true, label: '2' }]);
    expect(sandbox.label([{}], network)).toEqual([{ ok: true, label: '2' }]);
    expect(network.nodes).toEqual([{ name: 'Ada' }]);
    sandbox.dispose();
  });
});
