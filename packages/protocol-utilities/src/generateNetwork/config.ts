/**
 * A closed `[min, max]` numeric range a random draw is sampled from.
 */
type Range = { min: number; max: number };

/**
 * Tuning constants for synthetic network generation. Every value is an
 * assumption about how much data a stage should fabricate; exposing them as
 * config (resolved over {@link DEFAULT_GENERATION_CONFIG}) keeps them visible
 * and overridable instead of buried as literals. Callers pass a `Partial` of
 * this and the defaults fill the rest.
 */
export type GenerationConfig = {
  /**
   * Probability that a node on a mixed name-generator stage (one that can both
   * draw from a roster and fabricate) is drawn from the roster rather than
   * fabricated, while roster rows remain.
   */
  rosterDrawRatio: number;
  /** Node-count window used when a name-generator stage omits `behaviours`. */
  nodeCount: Range;
  /**
   * Scales the per-stage drop-out probability, which grows across the protocol
   * as `((stageIndex + 1) / stageCount) * dropOutFactor`.
   */
  dropOutFactor: number;
  /** Per-pair edge probability for Sociogram prompts. */
  sociogramEdgeProbability: Range;
  /** {x, y} position range for Sociogram layout variables (unit-square inset). */
  sociogramLayoutRange: Range;
  /** Per-pair edge probability for DyadCensus and TieStrengthCensus prompts. */
  censusEdgeProbability: Range;
  /** Per-pair edge probability for NetworkComposer edge types. */
  networkComposerEdgeProbability: Range;
  /** Node-count range for a FamilyPedigree stage. */
  familyPedigreeNodeCount: Range;
  /**
   * Fraction of an in-progress stage's subject nodes left unplaced (always at
   * least one node), so the stage presents as partially complete.
   */
  inProgressClearRatio: number;
};

const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  rosterDrawRatio: 0.7,
  nodeCount: { min: 1, max: 8 },
  dropOutFactor: 0.15,
  sociogramEdgeProbability: { min: 0.3, max: 0.5 },
  sociogramLayoutRange: { min: 0.1, max: 0.9 },
  censusEdgeProbability: { min: 0.4, max: 0.6 },
  networkComposerEdgeProbability: { min: 0.05, max: 0.1 },
  familyPedigreeNodeCount: { min: 4, max: 10 },
  inProgressClearRatio: 0.5,
};

export function resolveGenerationConfig(
  overrides?: Partial<GenerationConfig>,
): GenerationConfig {
  return { ...DEFAULT_GENERATION_CONFIG, ...overrides };
}
