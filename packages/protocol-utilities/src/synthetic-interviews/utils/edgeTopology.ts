import {
  type EdgeTopology,
  topologyDrawWindow,
  topologyTargetFromDraw,
} from '@codaco/protocol-validation';
import {
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import type { SessionStreams } from '../session-engine/streams';
import {
  sampleBeta,
  sampleNormal,
  sampleTruncated,
} from '../value-generators/distributions';
import { countUniform } from './sampleCount';

/**
 * The one place a stage's `synthetic.topology` becomes edges.
 *
 * Every interface that links people — Sociogram, the three censuses,
 * NetworkComposer — asks the same two questions: which pairs am I working
 * over, and how many of them carry a tie? Answering either of them twice is
 * how the two could disagree about a network they share, so both answers live
 * here and every simulator reads them.
 *
 * The numbers themselves are the schema's: `topologyDrawWindow` says what a
 * declaration can return, and `topologyTargetFromDraw` turns a drawn metric
 * into a whole number of edges inside what the network can hold. Nothing below
 * decides for itself what is too many (spec rule 2).
 */

/** Two people a stage asks about together, in the order the interface shows them. */
export type NodePair = readonly [string, string];

/**
 * Every unordered pair of the nodes a stage is working over, in the order the
 * interview enumerates them.
 *
 * Mirrors `getNodePairs` (interview `selectors/dyad-census.ts`), which walks
 * the node list and pairs each person with everybody after them — so the pairs
 * come out in node-list order, first person first, and each pair appears once
 * with its earlier member as `from`. The census interfaces step through this
 * list one pair at a time, and OneToManyDyadCensus reaches the same set from
 * the other direction: its focal node walks the same list, and the targets it
 * can still be asked about are exactly the people after it.
 */
export const unorderedPairs = (nodes: readonly NcNode[]): NodePair[] => {
  const ids = nodes.map((node) => node[entityPrimaryKeyProperty]);
  const pairs: NodePair[] = [];

  for (const [position, from] of ids.entries()) {
    for (const to of ids.slice(position + 1)) pairs.push([from, to]);
  }

  return pairs;
};

/**
 * The edge of `edgeType` already joining a pair, whichever way round it was
 * drawn, or `null`.
 *
 * The runtime's `edgeExists` (interview `store/modules/session.ts`): edges live
 * on one shared graph and carry no stage or prompt provenance, so a pair a
 * sibling prompt — or a stage twelve steps back — already linked reads as
 * linked here. Every interface that creates an edge asks this first, which is
 * what keeps a pair from collecting two edges of one type.
 */
export const edgeForPair = (
  network: NcNetwork,
  pair: NodePair,
  edgeType: string,
): NcEdge | null => {
  const [from, to] = pair;
  const match = network.edges.find(
    (edge) =>
      edge.type === edgeType &&
      ((edge.from === from && edge.to === to) ||
        (edge.from === to && edge.to === from)),
  );

  return match ?? null;
};

/**
 * One realisation of a declared topology, as a proportion or a mean degree.
 *
 * Drawn from the session's `counts` substream, because how densely a
 * participant links the people they named is a quantity of the same kind as
 * how many they named: both are decided once per stage, and both should move
 * together under a seed rather than being perturbed by an unrelated coin.
 *
 * Open families are TRUNCATED into the window the schema resolves — a redraw
 * rather than a clamp, so the tails stay tails instead of piling onto a bound
 * (see `sampleTruncated`). Beta needs no truncation: it is defined on 0-1,
 * which is a density's whole domain.
 */
const sampleTopologyMetric = (
  topology: EdgeTopology,
  streams: SessionStreams,
): number => {
  const uniform = countUniform(streams);
  const window = topologyDrawWindow(topology);
  const declared = topology.distribution;

  switch (declared.distribution) {
    case 'constant':
      return declared.value;
    case 'uniform':
      return uniform(window.min, window.max);
    case 'normal':
      return sampleTruncated(
        () => sampleNormal(uniform, declared.mean, declared.sd),
        window.min,
        window.max,
      );
    case 'beta':
      return sampleBeta(uniform, declared.mean, declared.sd);
  }
};

/**
 * Which of a prompt's pairs carry a tie, as positions in `pairs`.
 *
 * The declared topology decides HOW MANY (through the schema's own
 * realisation resolver, which owns the rounding and the bound); which ones is
 * a draw without replacement from the session's `coins` substream, because
 * nothing in the protocol describes WHICH people a participant links and
 * inventing a structural preference here would be a model no researcher asked
 * for.
 *
 * Positions rather than pairs, so a caller can walk the pairs in interface
 * order — which is the order the participant answers in — and ask of each one
 * whether it was chosen.
 */
export const chooseLinkedPairs = ({
  topology,
  pairs,
  nodeCount,
  streams,
}: {
  topology: EdgeTopology;
  pairs: readonly NodePair[];
  /** The people the stage is working over: a mean degree is per person. */
  nodeCount: number;
  streams: SessionStreams;
}): ReadonlySet<number> => {
  const target = topologyTargetFromDraw(
    topology,
    sampleTopologyMetric(topology, streams),
    pairs.length,
    nodeCount,
  );

  // `topologyTargetFromDraw` holds the target inside `[0, pairs.length]`, so
  // there is always another position to take.
  const remaining = [...pairs.keys()];
  const chosen = new Set<number>();
  for (let taken = 0; taken < target; taken += 1) {
    const pick = streams.int('coins', 0, remaining.length - 1);
    for (const position of remaining.splice(pick, 1)) chosen.add(position);
  }

  return chosen;
};
