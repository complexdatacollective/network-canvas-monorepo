import { todayYmd } from './constraints/dateWindow';

/**
 * A closed `[min, max]` numeric range.
 */
type Range = { min: number; max: number };

/**
 * Run-level controls for synthetic session generation. Everything that used
 * to tune per-stage fabrication (node-count windows, edge probabilities,
 * roster ratios) is gone: those quantities now come from the codebook's
 * `synthetic` metadata and its documented defaults. What remains configures
 * the SESSION being simulated, not the network being described.
 */
export type GenerationConfig = {
  /**
   * Scales the per-stage drop-out probability, which grows across the
   * protocol as `((stageIndex + 1) / stageCount) * dropOutFactor`.
   */
  dropOutFactor: number;
  /**
   * Fraction of an in-progress stage's subject nodes left unanswered (always
   * at least one node), so the stage presents as partially complete.
   */
  inProgressClearRatio: number;
  /**
   * The date RelativeDatePicker bounds are resolved against, as YYYY-MM-DD.
   * Omit it and the clock is read once per run; supply it to pin the run's
   * date. Optional so that adding it did not break consumers who annotate a
   * whole config — internally it is always present, as
   * ResolvedGenerationConfig.
   */
  today?: string;
};

/**
 * A config every field of which has been settled. Generation reads `today` on
 * every date draw, so resolving it once up front is what keeps a seeded run
 * reproducible: reading the clock per draw made a fixed seed stop reproducing
 * across UTC midnight.
 */
export type ResolvedGenerationConfig = GenerationConfig & {
  today: string;
};

const DEFAULT_GENERATION_CONFIG: Omit<GenerationConfig, 'today'> = {
  dropOutFactor: 0.15,
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

/**
 * Worst-case bounds the up-front feasibility analysis counts with. These are
 * no longer generation tuning: the planner draws real quantities from the
 * codebook metadata. Feasibility only needs CEILINGS that provably cover
 * whatever the planner could draw, so `unique` value-space refusals stay
 * seed-independent and conservative — the counting half of feasibility's
 * plan-vs-capacity adaptation. Node ceilings are derived per run from the
 * codebook's declared counts (see `generateNetwork`); the edge probabilities
 * are pinned at 1 because a declared density may reach every pair.
 */
export type FeasibilityTuning = {
  nodeCount: Range;
  rosterDrawRatio: number;
  sociogramEdgeProbability: Range;
  censusEdgeProbability: Range;
  networkComposerEdgeProbability: Range;
  familyPedigreeNodeCount: Range;
};

export type FeasibilityConfig = FeasibilityTuning & { today: string };
