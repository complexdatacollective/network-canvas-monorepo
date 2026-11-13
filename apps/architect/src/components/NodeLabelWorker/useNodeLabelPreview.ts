import { useEffect, useMemo, useState } from 'react';

import {
  createNodeLabelEvaluator,
  NodeLabelWorkerError,
} from '@codaco/interview/node-label-worker';
import {
  DEFAULT_SYNTHETIC_SEED,
  generateNetwork,
} from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';
import { useAppSelector } from '~/ducks/hooks';
import { getProtocol } from '~/selectors/protocol';

const PREVIEW_DELAY_MS = 400;
const MAX_SAMPLE_NODES = 8;

export type NodeLabelPreviewRow = {
  node: NcNode;
  outcome:
    | { kind: 'label'; label: string }
    | { kind: 'no-label' }
    | { kind: 'error'; message: string };
};

export type NodeLabelPreview =
  | { status: 'checking' }
  | { status: 'labelled'; rows: NodeLabelPreviewRow[] }
  | { status: 'failed'; kind: NodeLabelWorkerError['kind']; message: string };

const EMPTY_NETWORK: NcNetwork = {
  nodes: [],
  edges: [],
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
};

/** A network like one an interview with this protocol could collect. */
const sampleNetworkFor = (protocol: CurrentProtocol | null): NcNetwork => {
  if (!protocol) return EMPTY_NETWORK;
  try {
    return generateNetwork({
      codebook: protocol.codebook,
      stages: protocol.stages,
      seed: DEFAULT_SYNTHETIC_SEED,
    }).network;
  } catch {
    // A protocol no sample data can satisfy still has a script to check.
    return EMPTY_NETWORK;
  }
};

/**
 * Loads `source` as a node label worker. Resolves with why it cannot be used,
 * or with nothing when it can.
 */
export async function checkNodeLabelWorker(
  source: string,
): Promise<NodeLabelWorkerError | undefined> {
  const evaluator = createNodeLabelEvaluator(source);
  try {
    await evaluator.ready;
    return undefined;
  } catch (error) {
    if (error instanceof NodeLabelWorkerError) return error;
    throw error;
  } finally {
    evaluator.dispose();
  }
}

/**
 * What the node label worker in `source` makes of sample nodes from the open
 * protocol, shortly after `source` stops changing.
 */
export function useNodeLabelPreview(source: string): NodeLabelPreview {
  const protocol = useAppSelector(getProtocol);
  const network = useMemo(() => sampleNetworkFor(protocol), [protocol]);
  const codebook = protocol?.codebook;
  const [settled, setSettled] = useState<{
    source: string;
    network: NcNetwork;
    preview: NodeLabelPreview;
  }>();

  useEffect(() => {
    let cancelled = false;
    let evaluator: ReturnType<typeof createNodeLabelEvaluator> | undefined;

    const run = async (): Promise<NodeLabelPreview> => {
      evaluator = createNodeLabelEvaluator(source);
      const nodes = network.nodes.slice(0, MAX_SAMPLE_NODES);
      try {
        const results = await evaluator.label({ nodes, network, codebook });
        return {
          status: 'labelled',
          rows: nodes.map((node, index): NodeLabelPreviewRow => {
            const result = results[index];
            if (result?.ok) {
              return { node, outcome: { kind: 'label', label: result.label } };
            }
            return result?.reason === 'threw'
              ? { node, outcome: { kind: 'error', message: result.message } }
              : { node, outcome: { kind: 'no-label' } };
          }),
        };
      } catch (error) {
        return {
          status: 'failed',
          kind: error instanceof NodeLabelWorkerError ? error.kind : 'crashed',
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        evaluator.dispose();
      }
    };

    const timer = setTimeout(() => {
      void (async () => {
        const preview = await run();
        if (!cancelled) setSettled({ source, network, preview });
      })();
    }, PREVIEW_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      evaluator?.dispose();
    };
  }, [source, network, codebook]);

  return settled?.source === source && settled.network === network
    ? settled.preview
    : { status: 'checking' };
}
