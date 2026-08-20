import {
  type EdgeTopology,
  SCALAR_DOMAIN,
  topologyTargetFromDraw,
} from '@codaco/protocol-validation';

import type { SessionStreams } from '../../session-engine/streams';
import {
  sampleBeta,
  sampleNormal,
  sampleTruncated,
  type UniformSource,
} from '../../value-generators/distributions';

/**
 * How many edges one edge-creating stage lays down, and over which pairs.
 *
 * INTEGRATOR NOTE: this is the local stand-in for the shared topology helper
 * being built alongside it for Sociogram and the censuses. It is deliberately
 * the same shape — draw the declared metric from the session's `counts`
 * substream, hand it to the schema's own realisation resolver, then choose
 * that many pairs from the `coins` substream — so collapsing the two is a
 * delete-and-re-point rather than a rewrite. Nothing here decides what is too
 * many: `topologyTargetFromDraw` owns both the metric-to-count mapping and the
 * clamp into the pairs available (spec rule 2), which is why this file states
 * no bound of its own.
 */

/**
 * The metric draw, from the session's `counts` substream.
 *
 * `counts` rather than `coins` because a topology draw is a per-stage quantity
 * — how connected this participant's network is — in the same class as how
 * many people a stage elicits; the coins are spent per candidate pair below.
 */
const topologyUniform =
  (streams: SessionStreams): UniformSource =>
  (min, max) =>
    min + streams.draw('counts') * (max - min);

/**
 * One draw of a stage's declared topology metric — a density proportion, or a
 * mean degree.
 *
 * Open-tailed families are drawn TRUNCATED over their own `min`/`max`, and
 * their absence on a side is that side left unbounded — an intersection, not a
 * default, exactly as `sampleCount` reads an open-tailed count. A DENSITY's
 * open side is bounded rather than infinite, because a proportion lives on the
 * normalised scale whether or not the author restated it; `SCALAR_DOMAIN` is
 * where that scale is defined, so it is read rather than written out again.
 * Whether the result asks for more edges than exist is not decided here.
 */
const sampleTopologyMetric = (
  topology: EdgeTopology,
  uniform: UniformSource,
): number => {
  if (topology.metric === 'density') {
    const density = topology.distribution;
    switch (density.distribution) {
      case 'constant':
        return density.value;
      case 'uniform':
        return uniform(
          density.min ?? SCALAR_DOMAIN.minValue,
          density.max ?? SCALAR_DOMAIN.maxValue,
        );
      case 'beta':
        return sampleBeta(uniform, density.mean, density.sd);
      case 'normal':
        return sampleTruncated(
          () => sampleNormal(uniform, density.mean, density.sd),
          density.min ?? SCALAR_DOMAIN.minValue,
          density.max ?? SCALAR_DOMAIN.maxValue,
        );
    }
  }

  const meanDegree = topology.distribution;
  switch (meanDegree.distribution) {
    case 'constant':
      return meanDegree.value;
    case 'uniform':
      return uniform(meanDegree.min, meanDegree.max);
    case 'normal':
      return sampleTruncated(
        () => sampleNormal(uniform, meanDegree.mean, meanDegree.sd),
        meanDegree.min ?? 0,
        meanDegree.max ?? Number.POSITIVE_INFINITY,
      );
  }
};

/**
 * The number of edges a stage creates over `pairCount` pairs it could still
 * connect, given `nodeCount` people on screen.
 *
 * `pairCount` is the pairs still AVAILABLE — a pair already carrying an edge of
 * this type is not one this stage can add — so the resolver's clamp lands on
 * what can actually be drawn rather than on a theoretical maximum.
 */
export const topologyEdgeTarget = (
  topology: EdgeTopology,
  streams: SessionStreams,
  pairCount: number,
  nodeCount: number,
): number =>
  topologyTargetFromDraw(
    topology,
    sampleTopologyMetric(topology, topologyUniform(streams)),
    pairCount,
    nodeCount,
  );

/**
 * `count` of the candidates, chosen uniformly without replacement.
 *
 * A partial Fisher-Yates over a copy, so the choice is uniform over subsets and
 * costs one draw per chosen item rather than one per candidate — a census-sized
 * pair set is quadratic in the network, and a per-candidate coin would make the
 * stream position depend on the network's size rather than on what the
 * participant did.
 */
export const chooseWithoutReplacement = <T>(
  candidates: readonly T[],
  count: number,
  streams: SessionStreams,
): T[] => {
  const pool = [...candidates];
  const chosen: T[] = [];

  for (let taken = 0; taken < count && pool.length > 0; taken += 1) {
    const index = streams.int('coins', 0, pool.length - 1);
    const last = pool.length - 1;
    const picked = pool[index];
    const swapped = pool[last];
    if (picked === undefined || swapped === undefined) break;
    pool[index] = swapped;
    pool.pop();
    chosen.push(picked);
  }

  return chosen;
};
