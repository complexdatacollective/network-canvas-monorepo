import variant from '@jitl/quickjs-asmjs-mjs-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  shouldInterruptAfterDeadline,
} from 'quickjs-emscripten-core';

import { NODE_LABEL_WORKER_FUNCTION_NAME } from '@codaco/protocol-validation';

import type {
  NodeLabelFailure,
  NodeLabelResult,
  WorkerEntity,
  WorkerNetwork,
} from './messages';

// A protocol's node label worker is code its author wrote, run on the device
// of whoever opens the protocol. So it runs inside QuickJS, a JavaScript
// engine of its own, rather than in the browser's: the function can compute
// with what it is handed and nothing else. It has no `fetch`, storage, DOM,
// `import` or timers, because the engine has none to give it, and it is
// stopped when it runs out of time or memory. The build used is QuickJS
// compiled to plain JavaScript, so it needs no WebAssembly and runs under a
// content security policy that allows neither that nor `eval`.

const LOAD_TIME_LIMIT_MS = 1000;
const BATCH_TIME_LIMIT_MS = 1500;
const MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const STACK_LIMIT_BYTES = 512 * 1024;

const ENTRY_POINT = '__nodeLabels';

// Before the source, on its first line, so the line numbers of an error are
// the author's own. A worker written for Interviewer Classic may log, or
// resolve a promise from a timer; the engine has neither, so `console` is
// silent and a timer's callback runs as soon as the function returns.
const PRELUDE = `globalThis.console = Object.freeze(Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((method) => [method, () => {}]))); globalThis.setTimeout = (callback, _delay, ...args) => { Promise.resolve().then(() => callback(...args)); return 0; }; globalThis.clearTimeout = () => {};`;

const POSTLUDE = `
;(() => {
  if (typeof ${NODE_LABEL_WORKER_FUNCTION_NAME} !== 'function') {
    throw new SyntaxError('The script must declare a function named ${NODE_LABEL_WORKER_FUNCTION_NAME}.');
  }
  const labelFunction = ${NODE_LABEL_WORKER_FUNCTION_NAME};
  const threw = (error) => ({
    ok: false,
    reason: 'threw',
    message: String(error instanceof Error ? error.message : error),
  });
  const labelled = (value) =>
    typeof value === 'string' && value.trim() !== ''
      ? { ok: true, label: value }
      : { ok: false, reason: 'no-label' };
  globalThis.${ENTRY_POINT} = (input) => {
    const { nodes, network } = JSON.parse(input);
    return Promise.all(
      nodes.map((node) => {
        try {
          return Promise.resolve(labelFunction({ node, network })).then(
            labelled,
            threw,
          );
        } catch (error) {
          return threw(error);
        }
      }),
    ).then((results) => JSON.stringify(results));
  };
})();`;

export class NodeLabelSandboxError extends Error {
  readonly failure: NodeLabelFailure;

  constructor(failure: NodeLabelFailure) {
    super(failure.message);
    this.name = 'NodeLabelSandboxError';
    this.failure = failure;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNodeLabelResult = (value: unknown): value is NodeLabelResult => {
  if (!isRecord(value)) return false;
  if (value.ok === true) return typeof value.label === 'string';
  if (value.ok !== false) return false;
  return value.reason === 'threw'
    ? typeof value.message === 'string'
    : value.reason === 'no-label';
};

const isNodeLabelResults = (value: unknown): value is NodeLabelResult[] =>
  Array.isArray(value) && value.every(isNodeLabelResult);

/** An error raised inside the engine, as a failure of the given kind. */
const failureFrom = (
  context: QuickJSContext,
  error: QuickJSHandle,
  kind: 'compile' | 'crashed',
): NodeLabelFailure => {
  const dumped: unknown = context.dump(error);
  error.dispose();
  if (!isRecord(dumped)) return { kind, message: String(dumped) };

  const message =
    typeof dumped.message === 'string' ? dumped.message : 'Unknown error';
  // The engine raises this, uncatchably, when the time limit passes.
  if (dumped.name === 'InternalError' && message === 'interrupted') {
    return { kind: 'timeout', message: 'The function took too long to run.' };
  }
  const name = typeof dumped.name === 'string' ? `${dumped.name}: ` : '';
  const line =
    typeof dumped.lineNumber === 'number' ? ` (line ${dumped.lineNumber})` : '';
  return { kind, message: `${name}${message}${line}` };
};

export type NodeLabelSandbox = {
  /**
   * What the worker makes of each node, in order. Throws
   * `NodeLabelSandboxError` when it produces nothing at all.
   */
  label: (
    nodes: readonly WorkerEntity[],
    network: WorkerNetwork,
  ) => NodeLabelResult[];
  dispose: () => void;
};

const limitTime = (runtime: QuickJSRuntime, milliseconds: number) => {
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + milliseconds),
  );
};

/**
 * Loads a node label worker's source into an engine of its own. Rejects with
 * a `NodeLabelSandboxError` of kind `compile` when the source cannot be used.
 */
export async function createNodeLabelSandbox(
  source: string,
): Promise<NodeLabelSandbox> {
  const quickJs = await newQuickJSWASMModuleFromVariant(variant);
  const runtime = quickJs.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(STACK_LIMIT_BYTES);
  const context = runtime.newContext();

  const dispose = () => {
    context.dispose();
    runtime.dispose();
  };

  limitTime(runtime, LOAD_TIME_LIMIT_MS);
  const loaded = context.evalCode(
    `${PRELUDE}${source}${POSTLUDE}`,
    `${NODE_LABEL_WORKER_FUNCTION_NAME}.js`,
  );
  if (loaded.error) {
    const failure = failureFrom(context, loaded.error, 'compile');
    dispose();
    throw new NodeLabelSandboxError(failure);
  }
  loaded.value.dispose();

  const label: NodeLabelSandbox['label'] = (nodes, network) => {
    limitTime(runtime, BATCH_TIME_LIMIT_MS);

    const entryPoint = context.getProp(context.global, ENTRY_POINT);
    const input = context.newString(JSON.stringify({ nodes, network }));
    const called = context.callFunction(entryPoint, context.undefined, input);
    entryPoint.dispose();
    input.dispose();
    if (called.error) {
      throw new NodeLabelSandboxError(
        failureFrom(context, called.error, 'crashed'),
      );
    }

    const promise = called.value;
    // A promise the function returned settles only as the engine's own job
    // queue is run: nothing outside it can settle one.
    const jobs = runtime.executePendingJobs();
    if (jobs.error) {
      promise.dispose();
      throw new NodeLabelSandboxError(
        failureFrom(context, jobs.error, 'crashed'),
      );
    }

    const state = context.getPromiseState(promise);
    promise.dispose();
    if (state.type === 'pending') {
      throw new NodeLabelSandboxError({
        kind: 'unsettled',
        message: 'The function returned a promise that never settled.',
      });
    }
    if (state.type === 'rejected') {
      throw new NodeLabelSandboxError(
        failureFrom(context, state.error, 'crashed'),
      );
    }

    const output = context.getString(state.value);
    state.value.dispose();
    const results: unknown = JSON.parse(output);
    if (!isNodeLabelResults(results) || results.length !== nodes.length) {
      throw new NodeLabelSandboxError({
        kind: 'crashed',
        message: 'The worker returned results that could not be read.',
      });
    }
    return results;
  };

  return { label, dispose };
}
