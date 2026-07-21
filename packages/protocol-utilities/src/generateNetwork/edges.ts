import { v4 as uuid } from 'uuid';

import type { Variables } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { generateAttributes } from './attributes';
import type { GenerationContext } from './context';

export function getNodesOfType(nodes: NcNode[], nodeType: string): NcNode[] {
  return nodes.filter((n) => n.type === nodeType);
}

export function getEdgesOfType(edges: NcEdge[], edgeType: string): NcEdge[] {
  return edges.filter((e) => e.type === edgeType);
}

/**
 * Considers every unordered pair of nodes, creating an edge of `edgeType` with
 * the given per-pair `probability`. Pairs left unconnected are returned as
 * `negativeIndices` so census stages can record explicit "no" responses.
 */
export function createEdgesForPairs(
  ctx: GenerationContext,
  nodes: NcNode[],
  edgeType: string,
  probability: number,
  edgeVariables?: Variables,
): { edges: NcEdge[]; negativeIndices: [number, number][] } {
  const edges: NcEdge[] = [];
  const negativeIndices: [number, number][] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (ctx.valueGen.randomFloat(0, 1) < probability) {
        const attrs = edgeVariables
          ? generateAttributes(edgeVariables, ctx.valueGen, edges.length)
          : {};

        const edge: NcEdge = {
          [entityPrimaryKeyProperty]: uuid(),
          type: edgeType,
          from: nodes[i]![entityPrimaryKeyProperty],
          to: nodes[j]![entityPrimaryKeyProperty],
          [entityAttributesProperty]: attrs,
        };
        edges.push(edge);
      } else {
        negativeIndices.push([i, j]);
      }
    }
  }

  return { edges, negativeIndices };
}
