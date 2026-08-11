/**
 * How large a family may grow before its optional branches are capped.
 *
 * Nothing in a protocol caps a pedigree. The codebook describes what a family
 * IS rather than how big one gets, and the stage-level `synthetic` counts
 * belong to the interfaces that size a population rather than build a
 * structure — a pedigree sizes itself from its own population profile. This is
 * the engine's own bound, which a caller may raise or lower through its
 * `familyPedigree` options; the generator's seven-person core stands under
 * either.
 */
export const DEFAULT_PEDIGREE_NODE_CEILING = 32;
