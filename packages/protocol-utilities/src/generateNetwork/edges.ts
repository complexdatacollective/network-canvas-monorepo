import { v4 as uuid } from 'uuid';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { generateAttributesForEntity } from './attributes.ts';
import type { GenerationContext } from './context.ts';

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

/** A pair the walk settled, and the edge that joins it. */
export type PairEdge = {
  /** The pair's positions in the `nodes` array the walk was given. */
  indices: [number, number];
  edge: NcEdge;
};

/**
 * Considers every unordered pair of nodes, creating an edge of `edgeType` with
 * the given per-pair `probability`.
 *
 * A pair `existingEdges` already joins with an edge of the type is reused
 * rather than drawn again, because that is what the interview does: every
 * interface that creates an edge for a pair looks it up with `edgeExists`
 * first, and adds one only where there is none. Pairs left unconnected are
 * returned as `negativeIndices` so census stages can record explicit "no"
 * responses; reused pairs are returned apart from both, since they are neither
 * a new edge nor a negative answer.
 */
export function createEdgesForPairs(
  ctx: GenerationContext,
  nodes: NcNode[],
  edgeType: string,
  probability: number,
  existingEdges: NcEdge[],
): {
  created: PairEdge[];
  reused: PairEdge[];
  negativeIndices: [number, number][];
} {
  const created: PairEdge[] = [];
  const reused: PairEdge[] = [];
  const negativeIndices: [number, number][] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const from = nodes[i]![entityPrimaryKeyProperty];
      const to = nodes[j]![entityPrimaryKeyProperty];

      // Tested above the roll, so a reused pair consumes no probability draw,
      // generates no attributes, and reaches no `unique` claim — leaving
      // nothing to unwind.
      //
      // Deliberately not the runtime's whole behaviour: a participant
      // answering "no" for a pair that already has an edge deletes it
      // (DyadCensus, TieStrengthCensus, and `toggleEdge` by construction).
      // Reproducing that would let a stage twelve steps later silently erase
      // an earlier stage's answer, leaving that stage's own metadata
      // contradicting the graph. The pair is instead treated as the
      // pre-selected "Yes" the runtime shows for an existing edge, and is not
      // rolled at all.
      const existing = findEdgeForPair(existingEdges, from, to, edgeType);
      if (existing) {
        reused.push({ indices: [i, j], edge: existing });
        continue;
      }

      if (ctx.valueGen.randomFloat(0, 1) < probability) {
        const attrs = generateAttributesForEntity(
          ctx,
          { entity: 'edge', type: edgeType },
          created.length,
        );

        created.push({
          indices: [i, j],
          edge: {
            [entityPrimaryKeyProperty]: uuid(),
            type: edgeType,
            from,
            to,
            [entityAttributesProperty]: attrs,
          },
        });
      } else {
        negativeIndices.push([i, j]);
      }
    }
  }

  return { created, reused, negativeIndices };
}
