import type { EdgeTopology } from './index.ts';

/**
 * The edge counts a stage can actually realise, as an inclusive window.
 *
 * Zero to the number of distinct pairs available: a stage cannot create a
 * negative number of edges, and — the generator creating at most one edge of a
 * type between any two people — cannot create more than one per pair. Both
 * bounds are properties of the network the stage is working over, not of the
 * declaration, which is why `EdgeTopology` is not an argument here.
 *
 * The topology twin of {@link withResolvedSyntheticCount}'s bounds: the schema
 * owns the clamp, and generation reads it. Generation draws a proportion or a
 * mean degree, hands it here to be turned into an edge count, and creates that
 * many — it never decides for itself what is too many, because a bound applied
 * in two places is a bound that can disagree with itself.
 */
export const topologyTargetBounds = (
  pairCount: number,
): { min: 0; max: number } => ({ min: 0, max: Math.max(0, pairCount) });

/**
 * The edge count a drawn topology metric asks for, as a whole number inside
 * the bounds above.
 *
 * Each metric names a different quantity, so each converts differently:
 * `density` is the PROPORTION of available pairs that carry an edge, so it
 * multiplies by the pair count; `meanDegree` is the average number of edges
 * per person, and every edge contributes to two people's degrees, so it
 * multiplies by half the node count. Rounding happens once, here, and the
 * result is held inside {@link topologyTargetBounds} — a beta density cannot
 * leave 0-1, but a `meanDegree` above the population size can and does ask for
 * more edges than there are pairs.
 *
 * Pure, and the single owner of both mappings, so the stage schema that admits
 * a topology and the generator that realises one cannot drift apart.
 */
export const topologyTargetFromDraw = (
  topology: EdgeTopology,
  draw: number,
  pairCount: number,
  nodeCount: number,
): number => {
  const target =
    topology.metric === 'density' ? draw * pairCount : (draw * nodeCount) / 2;
  const { min, max } = topologyTargetBounds(pairCount);
  return Math.min(Math.max(Math.round(target), min), max);
};
