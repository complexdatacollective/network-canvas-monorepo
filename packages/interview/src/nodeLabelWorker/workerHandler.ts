import type {
  NodeLabelFailure,
  NodeLabelWorkerRequest,
  NodeLabelWorkerResponse,
} from './messages';
import {
  createNodeLabelSandbox,
  type NodeLabelSandbox,
  NodeLabelSandboxError,
} from './sandbox';

const failureOf = (error: unknown): NodeLabelFailure =>
  error instanceof NodeLabelSandboxError
    ? error.failure
    : {
        kind: 'crashed',
        message: error instanceof Error ? error.message : String(error),
      };

/**
 * Answers the worker's messages: `init` loads a source, replacing any loaded
 * before it, and `label` asks the loaded source for labels. Apart from the
 * worker file so the same exchange can be run without a Worker.
 */
export function createNodeLabelWorkerHandler() {
  let sandbox: NodeLabelSandbox | undefined;

  return async (
    request: NodeLabelWorkerRequest,
  ): Promise<NodeLabelWorkerResponse> => {
    try {
      if (request.type === 'init') {
        sandbox?.dispose();
        sandbox = undefined;
        sandbox = await createNodeLabelSandbox(request.source);
        return { id: request.id, ok: true, results: [] };
      }
      if (!sandbox) {
        return {
          id: request.id,
          ok: false,
          failure: { kind: 'crashed', message: 'No source has been loaded.' },
        };
      }
      return {
        id: request.id,
        ok: true,
        results: sandbox.label(request.nodes, request.network),
      };
    } catch (error) {
      return { id: request.id, ok: false, failure: failureOf(error) };
    }
  };
}
