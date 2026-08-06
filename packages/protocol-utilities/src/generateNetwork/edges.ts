import { v4 as uuid } from 'uuid';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { generateAttributesForEntity } from './attributes';
import type { GenerationContext } from './context';

export function getNodesOfType(nodes: NcNode[], nodeType: string): NcNode[] {
  return nodes.filter((n) => n.type === nodeType);
}

export function getEdgesOfType(edges: NcEdge[], edgeType: string): NcEdge[] {
  return edges.filter((e) => e.type === edgeType);
}

/**
 * The edge of `edgeType` already joining `a` and `b`, whichever way round it
 * was drawn.
 *
 * Mirrors the interview's own `edgeExists`, which matches `{ from, to, type }`
 * in either direction over the whole session edge list. Edges live on one
 * shared graph and carry no stage or prompt provenance, so this lookup spans
 * the run rather than the stage that created the edge.
 */
function findEdgeForPair(
  edges: NcEdge[],
  a: NcEdge['from'],
  b: NcEdge['to'],
  edgeType: string,
): NcEdge | undefined {
  return edges.find(
    (edge) =>
      edge.type === edgeType &&
      ((edge.from === a && edge.to === b) ||
        (edge.from === b && edge.to === a)),
  );
}

