import { todayYmd } from './constraints/dateWindow';

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
  /**
   * Chance a node is highlighted on a Sociogram prompt collecting one. Below a
   * half because a highlight prompt names a subset — "who supports you" —
   * rather than splitting the network evenly.
   */
  sociogramHighlightProbability: number;
  /**
   * Which pedigree parameter set to sample from. `showcase` guarantees the
   * unusual arrangements — adoption, donated gametes, a gestational carrier —
   * appear, which is what a preview or an interface test needs; at true
   * population rates a single pedigree contains one under 5% of the time, so a
   * faithfully-calibrated default would leave that code untested.
   * `populationRates` is the right choice for a corpus somebody will count.
   */
  pedigreeMode: 'showcase' | 'populationRates';
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
  /**
   * The date RelativeDatePicker bounds are resolved against, as YYYY-MM-DD.
   * Omit it and the clock is read once per run; supply it to pin the run's
   * date. Optional so that adding it did not break consumers who annotate a
   * whole config — internally it is always present, as ResolvedGenerationConfig.
   */
  today?: string;
};

/**
 * A config every field of which has been settled. Generation reads `today` on
 * every date draw, so resolving it once up front is what keeps a seeded run
 * reproducible: reading the clock per draw made a fixed seed stop reproducing
 * across UTC midnight.
 */
export type ResolvedGenerationConfig = GenerationConfig & { today: string };

const DEFAULT_GENERATION_CONFIG: Omit<GenerationConfig, 'today'> = {
  rosterDrawRatio: 0.7,
  nodeCount: { min: 1, max: 8 },
  dropOutFactor: 0.15,
  sociogramEdgeProbability: { min: 0.3, max: 0.5 },
  sociogramLayoutRange: { min: 0.1, max: 0.9 },
  sociogramHighlightProbability: 0.35,
  pedigreeMode: 'showcase',
  censusEdgeProbability: { min: 0.4, max: 0.6 },
  networkComposerEdgeProbability: { min: 0.05, max: 0.1 },
  // A pedigree's size is drawn from fertility distributions rather than from
  // this range: four generations around ego average about 29 people. `max` is
  // the cap the generator trims its cousin tail to, and the worst case
  // feasibility counts against — the two must agree or a `unique` variable
  // passes the check and then runs out mid-run.
  familyPedigreeNodeCount: { min: 12, max: 40 },
  inProgressClearRatio: 0.5,
};

export function resolveGenerationConfig(
  overrides?: Partial<GenerationConfig>,
): ResolvedGenerationConfig {
  // `today` is destructured out rather than spread over the default, so an
  // explicit `{ today: undefined }` still resolves to a date instead of
  // clobbering one.
  const { today, ...tuning } = overrides ?? {};
  return {
    ...DEFAULT_GENERATION_CONFIG,
    ...tuning,
    today: today ?? todayYmd(),
  };
}
