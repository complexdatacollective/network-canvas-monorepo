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
 * The values each metric is defined over, before any declaration narrows them.
 *
 * A density is a PROPORTION of the available pairs, so it lives on 0-1; a mean
 * degree is an average number of ties per person, so it has no ceiling but
 * cannot go below zero. Both readings are already load-bearing in the schemas
 * that admit these distributions — `densityNormalSchema` holds a degenerate
 * mean to `{ min: 0, max: 1 }` and `meanDegreeNormalSchema` to `{ min: 0 }` —
 * and this is the same statement, named once so the draw can read it.
 */
const METRIC_DOMAIN: Record<
  EdgeTopology['metric'],
  { min: number; max: number }
> = {
  density: { min: 0, max: 1 },
  meanDegree: { min: 0, max: Number.POSITIVE_INFINITY },
};

/**
 * The window a topology's draws must land in: its metric's own domain,
 * narrowed by whatever bounds the declaration states.
 *
 * The twin of {@link syntheticCountSupport} for topologies, and here for the
 * same reason: a declaration may leave one or both bounds unstated — a
 * `uniform` density with neither means "any density at all" — and the value
 * standing in for an unstated bound is a property of the metric, not a choice
 * generation is entitled to make. Read where a draw is TRUNCATED into its
 * window, which is different from {@link topologyTargetBounds}: that one is
 * about how many edges the network can hold, this one about which values the
 * declaration can return.
 */
export const topologyDrawWindow = (
  topology: EdgeTopology,
): { min: number; max: number } => {
  const domain = METRIC_DOMAIN[topology.metric];
  const declared = topology.distribution;
  const declaredMin = 'min' in declared ? declared.min : undefined;
  const declaredMax = 'max' in declared ? declared.max : undefined;

  return {
    min:
      declaredMin === undefined
        ? domain.min
        : Math.max(declaredMin, domain.min),
    max:
      declaredMax === undefined
        ? domain.max
        : Math.min(declaredMax, domain.max),
  };
};

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

/**
 * The most edges one realisation of this topology can select over `pairCount`
 * pairs — the topology twin of `syntheticCountSupport`'s ceiling, and read for
 * the same reason: feasibility must count the entities a stage CAN produce,
 * and a sparse topology provably produces fewer than the full pair set.
 *
 * Derived through the same two resolvers every draw goes through — the
 * largest value the declaration can return, turned into a target — so the
 * bound cannot drift from what a realisation actually selects. A constant's
 * one value IS its largest draw (the draw returns it untruncated); every
 * other family is truncated into {@link topologyDrawWindow}, whose ceiling is
 * therefore its largest. An open ceiling (a mean degree with no declared
 * `max`) resolves to the pair count itself, which is the bound
 * {@link topologyTargetBounds} already imposes on every target.
 */
export const topologyRealisedEdgeCeiling = (
  topology: EdgeTopology,
  pairCount: number,
  nodeCount: number,
): number => {
  const declared = topology.distribution;
  const maxDraw =
    declared.distribution === 'constant'
      ? declared.value
      : topologyDrawWindow(topology).max;
  return topologyTargetFromDraw(topology, maxDraw, pairCount, nodeCount);
};
