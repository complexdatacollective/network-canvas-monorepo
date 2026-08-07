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
  /** Fallback ceiling for a node type the codebook gives no count. */
  nodeCount: Range;
  /**
   * Per-type ceilings from the codebook's declared counts. Counting a stage
   * against the largest population in the protocol would refuse protocols
   * whose own subject type is far smaller, so each type is counted against
   * its own declaration.
   */
  nodeCountByType?: Record<string, Range>;
  /**
   * Per stage, per node type, the most nodes that stage can contribute.
   *
   * A type's ceiling is a ceiling on its whole population, not on each stage
   * that builds it: the planner draws one total and apportions it across the
   * creating stages. Counting every stage at the type ceiling and summing
   * therefore multiplies the population by the number of generators, and a
   * `unique` variable with exactly enough values for the declared population
   * is refused before a plan that would have satisfied it ever runs.
   */
  nodeCapByStage?: Record<string, Record<string, number>>;
  /**
   * Per edge type, the most edges the planner can select for it.
   *
   * The old counter reads a per-pair probability and so counts every eligible
   * pair. The planner does not work that way: it draws one target from the
   * declared topology and selects exactly that many, so a twenty-node graph at
   * density 0.1 holds about nineteen edges rather than all one hundred and
   * ninety. Counting the pairs instead refuses `unique` edge variables whose
   * value space covers the actual plan comfortably.
   */
  edgeCountByType?: Record<string, number>;
  rosterDrawRatio: number;
  sociogramEdgeProbability: Range;
  censusEdgeProbability: Range;
  networkComposerEdgeProbability: Range;
  familyPedigreeNodeCount: Range;
};

export type FeasibilityConfig = FeasibilityTuning & { today: string };
