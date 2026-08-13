import type {
  EdgeTopology,
  Stage,
  StructuralCodebook,
} from '@codaco/protocol-validation';
import { MAX_SYNTHETIC_POPULATION } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import {
  analyseStageEffects,
  type StageEffects,
} from './generateNetwork/analyse/stageEffects';
import { definedAttributesOf } from './generateNetwork/attributes';
import {
  type FeasibilityConfig,
  type GenerationConfig,
  resolveGenerationConfig,
} from './generateNetwork/config';
import { collectBinOnlyVariables } from './generateNetwork/constraints/binOnlyVariables';
import { buildEntityConstraints } from './generateNetwork/constraints/buildConstraints';
import {
  applyComposerRenderings,
  COMPOSER_RENDERING_CONFLICT,
} from './generateNetwork/constraints/composerRenderings';
import { SyntheticDataConstraintError } from './generateNetwork/constraints/error';
import { analyseFeasibility } from './generateNetwork/constraints/feasibility';
import { reachableStagesForFeasibility } from './generateNetwork/constraints/reachableStages';
import type { EntityConstraints } from './generateNetwork/constraints/types';
import { UniqueRegistry } from './generateNetwork/constraints/uniqueRegistry';
import type { GenerationContext } from './generateNetwork/context';
import { resolveFamilyPedigreeGenerationOptions } from './generateNetwork/familyPedigree/referencePopulation';
import { reserveFamilyPedigreeFixedValues } from './generateNetwork/familyPedigree/reservations';
import { DEFAULT_PEDIGREE_NODE_CEILING } from './generateNetwork/familyPedigree/stageCeiling';
import type { FamilyPedigreeGenerationOptions } from './generateNetwork/familyPedigree/types';
import { materialiseSession } from './generateNetwork/materialise/materialiseSession';
import { countCeiling } from './generateNetwork/plan/distributions';
import {
  planNetwork,
  withinPopulationCeiling,
} from './generateNetwork/plan/networkPlan';
import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NODE_COUNT,
} from './generateNetwork/plan/resolveSynthetic';
import { ValueGenerator } from './ValueGenerator';

export type GenerateNetworkParams = {
  codebook: StructuralCodebook;
  stages: Stage[];
  /**
   * Pre-parsed roster rows keyed by **stage id**. Applies to node-subject
   * name-generator stages that source people from external data — roster stages
   * (`NameGeneratorRoster`) and name generators with roster panels. Rows are
   * drawn **without replacement across all prompts and stages** via a shared
   * used-set, mirroring the runtime's exclusion of rows already in the network.
   *
   * A key's presence is three-way. An **absent** key means "no roster known":
   * a roster stage fabricates people, a name generator fabricates as usual. An
   * **empty array** means "roster known to be empty" (the asset resolved but had
   * no rows, or a panel filtered them all out): a roster stage adds nobody,
   * while a name generator still fabricates to its planned counts. A
   * **non-empty** array draws from those rows (a roster stage only from them).
   */
  externalData?: Record<string, NcNode[]>;
  /** Seed for deterministic output. A random seed is used when omitted. */
  seed?: number;
  simulateDropOut?: boolean;
  respectSkipLogicAndFiltering?: boolean;
  /**
   * Index of a stage to treat as in progress rather than complete. For
   * interaction-driven stages (OrdinalBin, CategoricalBin, Sociogram), a subset
   * of subject nodes is left without a value for the stage's prompt variables,
   * so the stage's interaction can still be exercised. Has no effect on stage
   * types where complete data is preferable (e.g. forms).
   */
  inProgressStageIndex?: number;
  /** Overrides for run-level session controls. See {@link GenerationConfig}. */
  config?: Partial<GenerationConfig>;
  /** Family-specific demographic, scenario, and disease-generation settings. */
  familyPedigree?: FamilyPedigreeGenerationOptions;
};

export type GenerateNetworkResult = {
  network: NcNetwork;
  stageMetadata: Record<string, unknown> | null;
  currentStep: number;
  droppedOut: boolean;
};

/**
 * The people every pedigree holds before any optional branch: ego, two
 * parents, and four grandparents. `generateFamilyPedigree` adds them
 * unconditionally to satisfy the interface's hard minimum and its grandparent
 * boundary, so no declared count can produce a smaller family.
 */
const MINIMUM_PEDIGREE_CORE = 7;

/**
 * The people a pedigree can put on the canvas, per node type it builds.
 *
 * Kept per type and summed across stages rather than maximised, because a
 * topology ceiling
 * is about the pairs one subject type reaches and every pedigree over that
 * type adds its own family to the ones before it. A pedigree's population is not in `effectivePopulation`
 * at all — that map is built from the stage creations, and pedigree creations
 * are deliberately skipped — so without this a type a pedigree builds is
 * counted at nothing at all. That bounds a census over the family at zero
 * pairs, which is not a loose ceiling but an under-count: it hides the real
 * pair count from the value-space check, and a unique edge variable can pass
 * preflight and run out mid-materialisation.
 */
function familyPedigreePopulationByType(
  codebook: StructuralCodebook,
  stages: Stage[],
  /** The most people one family can reach, already resolved. */
  attainable: number,
): Map<string, number> {
  const populations = new Map<string, number>();
  for (const stage of stages) {
    if (stage.type !== 'FamilyPedigree') continue;
    const type = stage.nodeConfig?.type;
    if (type === undefined || codebook.node?.[type] === undefined) continue;
    // Accumulated, not maximised. A second pedigree over the same type does
    // not replace the first family: materialisation keeps the earlier people
    // and appends the new ones, reusing at most the ego between them. Two
    // core-sized families are therefore thirteen or fourteen subjects, and
    // keeping only the larger counted seven. The reused ego is deliberately
    // not deducted — reuse is "at most", so subtracting it would put the
    // ceiling below the population of a run that reuses nothing.
    populations.set(type, (populations.get(type) ?? 0) + attainable);
  }
  return populations;
}

/** Unordered pairs among `count` entities. */
const pairsAmong = (count: number): number =>
  count < 2 ? 0 : (count * (count - 1)) / 2;

/**
 * The largest value a topology distribution can draw, for every seed.
 *
 * A declared topology is a draw, and a refusal must not depend on what a draw
 * happens to produce — the same protocol has to fail on every seed or none.
 * So this is the distribution's ceiling rather than its centre: a constant is
 * exact, a bounded family gives its bound, and an unbounded one gives the
 * domain the sampler clamps it into. Six sigma is deliberately NOT used here,
 * unlike the count ceiling: nothing clamps a topology draw to it, so a rare
 * tail would exceed the bound feasibility had counted, and an under-count is
 * how a protocol passes preflight and then exhausts its values mid-plan.
 * Density is clamped into 0–1 by the sampler; an unbounded mean degree is not
 * clamped at all, so it stands as infinite and the pair count bounds it.
 */
function topologyMax(topology: EdgeTopology): number {
  const { distribution } = topology;
  const unbounded =
    topology.metric === 'density' ? 1 : Number.POSITIVE_INFINITY;
  const raw =
    distribution.distribution === 'constant'
      ? distribution.value
      : distribution.distribution === 'beta'
        ? // Beta lives on 0-1 by construction and is offered for density
          // alone, so the domain is its ceiling and it carries no `max`.
          1
        : (distribution.max ?? unbounded);
  return topology.metric === 'density'
    ? Math.min(1, Math.max(0, raw))
    : Math.max(0, raw);
}

/**
 * Worst-case bounds feasibility counts against, derived from the codebook's
 * declared populations and topologies.
 *
 * Both halves are ceilings the planner provably cannot exceed rather than
 * guesses: a node type's population is apportioned across its creating stages
 * exactly as the planner apportions it, and an edge type is bounded by the
 * most its declared topology can ask for. Counting a stage at its type's whole
 * ceiling, or a pair domain as if every pair could be linked, refuses
 * protocols whose plan would have fitted comfortably.
 */
function deriveFeasibilityConfig(
  codebook: StructuralCodebook,
  effects: StageEffects,
  today: string,
  pedigreeCeiling: number,
  pedigreePopulation: Map<string, number>,
): FeasibilityConfig {
  // --- Per-stage node ceilings ----------------------------------------------
  //
  // Each creating stage declares its own population, so there is nothing to
  // apportion and nothing to reconcile: the most of a type the planner can
  // build is the sum of what its creating stages can each ask for, and the
  // most one stage can build is its own declared ceiling clamped by the
  // capacity its interface actually offers.
  //
  // A pedigree's people are outside this — the specialist generator builds
  // them and `familyPedigreeNodeCount` bounds them — so its creations are left
  // out, exactly as the planner leaves them out.
  const nodeCapByStage: Record<string, Record<string, number>> = {};
  const effectivePopulation = new Map<string, number>();
  // Gathered per type first, then trimmed through the SAME reckoning the
  // planner applies. Counting the untrimmed figure here refused protocols the
  // preview can build quite happily: `behaviours.minNodes` is unbounded in the
  // schema, so a stage declaring a billion made preflight demand a billion
  // unique values while `planNetwork` went on to build ten thousand nodes.
  const ceilingsByType = new Map<
    string,
    { stageId: string; ceiling: number }[]
  >();
  for (const summary of effects.stages) {
    for (const creation of summary.nodeCreations) {
      if (creation.source === 'pedigree') continue;
      const declared = countCeiling(creation.count ?? DEFAULT_NODE_COUNT);
      const { min, max } = creation.capacity;
      const ceiling = Math.max(
        min,
        max === null ? declared : Math.min(max, declared),
      );
      const list = ceilingsByType.get(creation.nodeType) ?? [];
      list.push({ stageId: creation.stageId, ceiling });
      ceilingsByType.set(creation.nodeType, list);
    }
  }

  // Walked in CODEBOOK order, and deducting from one run-level budget, because
  // that is the order and the budget `planNetwork` trims against — read in
  // first-appearance order, or per type, the two would disagree about which
  // type keeps its people and preflight would size a population the plan does
  // not build.
  let populationBudget = MAX_SYNTHETIC_POPULATION;
  const trimOrder = [
    ...Object.keys(codebook.node ?? {}).filter((type) =>
      ceilingsByType.has(type),
    ),
    // A creation naming a type the codebook does not carry cannot be planned,
    // but it must not silently escape the budget either.
    ...[...ceilingsByType.keys()].filter(
      (type) => !(type in (codebook.node ?? {})),
    ),
  ];
  for (const nodeType of trimOrder) {
    const entries = ceilingsByType.get(nodeType) ?? [];
    const trimmed = withinPopulationCeiling(
      entries.map((entry) => entry.ceiling),
      populationBudget,
    );
    populationBudget -= trimmed.reduce((sum, count) => sum + count, 0);
    entries.forEach((entry, index) => {
      const ceiling = trimmed[index]!;
      const forStage = nodeCapByStage[entry.stageId] ?? {};
      // A stage creating one type through two interactions gets both.
      forStage[nodeType] = (forStage[nodeType] ?? 0) + ceiling;
      nodeCapByStage[entry.stageId] = forStage;

      effectivePopulation.set(
        nodeType,
        (effectivePopulation.get(nodeType) ?? 0) + ceiling,
      );
    });
  }

  let nodeCap = 1;
  const nodeCountByType: Record<string, { min: number; max: number }> = {};
  for (const type of Object.keys(codebook.node ?? {})) {
    // A type no stage creates has no creating stage to draw for it, so its
    // population is zero by construction rather than by a rule.
    const ceiling = effectivePopulation.get(type) ?? 0;
    nodeCountByType[type] = { min: 0, max: ceiling };
    nodeCap = Math.max(nodeCap, ceiling);
  }

  // --- Per-type edge ceilings -----------------------------------------------
  const edgeCountByType: Record<string, number> = {};
  for (const type of Object.keys(codebook.edge ?? {})) {
    const topologyCreations = (
      effects.edgeCreationsByType.get(type) ?? []
    ).filter((creation) => creation.structured === null);
    if (topologyCreations.length === 0) continue;

    // Bounded per creation, then MAXIMISED within a subject type and SUMMED
    // across subject types. A pair is two nodes of one type: stages over
    // different types reach disjoint sets of pairs and their edges add up,
    // while stages over the same type reach the same pairs, so the loosest of
    // their declared topologies bounds them all rather than their sum.
    const ceilingBySubject = new Map<string, number>();
    for (const creation of topologyCreations) {
      const topology = creation.topology ?? DEFAULT_EDGE_TOPOLOGY;
      const most = topologyMax(topology);
      // The two populations ADD. A pedigree's people are absent from
      // `effectivePopulation` — its creations are skipped when that map is
      // built — and `materializeFamilyPedigree` appends its family to what is
      // already there rather than replacing it, so a type built both ways ends
      // up carrying both. Taking the larger of the two under-counted the pairs
      // of exactly that type: one ordinary person beside a seven-person core
      // is eight subjects and 28 pairs, counted as 21.
      const ordinary = effectivePopulation.get(creation.subjectNodeType) ?? 0;
      const count =
        ordinary + (pedigreePopulation.get(creation.subjectNodeType) ?? 0);
      const pairs = pairsAmong(count);
      const bound = Math.min(
        pairs,
        Math.ceil(
          topology.metric === 'density' ? most * pairs : (most * count) / 2,
        ),
      );
      ceilingBySubject.set(
        creation.subjectNodeType,
        Math.max(ceilingBySubject.get(creation.subjectNodeType) ?? 0, bound),
      );
    }
    edgeCountByType[type] = [...ceilingBySubject.values()].reduce(
      (total, bound) => total + bound,
      0,
    );
  }

  return {
    nodeCount: { min: 0, max: nodeCap },
    nodeCountByType,
    nodeCapByStage,
    edgeCountByType,
    rosterDrawRatio: 0.7,
    sociogramEdgeProbability: { min: 0, max: 1 },
    censusEdgeProbability: { min: 0, max: 1 },
    networkComposerEdgeProbability: { min: 0, max: 1 },
    familyPedigreeNodeCount: { min: 0, max: pedigreeCeiling },
    today,
  };
}

/**
 * Generates a complete synthetic session: analyse the stages, plan the final
 * network from the codebook's `synthetic` metadata (or its documented
 * defaults), then materialise the plan back through the stage sequence so
 * entities appear where the interview would create them and stage metadata
 * matches the final graph.
 */
export function generateNetwork(
  params: GenerateNetworkParams,
): GenerateNetworkResult {
  const {
    codebook,
    stages,
    externalData: suppliedExternalData,
    seed,
    simulateDropOut = false,
    respectSkipLogicAndFiltering = false,
    inProgressStageIndex,
    config,
    familyPedigree,
  } = params;

  /**
   * Roster rows, with any legacy `null`/`undefined` attribute stripped.
   *
   * An unanswered attribute is an ABSENT key, and a caller's external data may
   * still carry the old null placeholders — read as values they were merged
   * onto the person built from the row, so a generated network came back
   * holding a null the contract forbids.
   */
  const externalData =
    suppliedExternalData === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(suppliedExternalData).map(([stageId, rows]) => [
            stageId,
            rows.map(
              (row) =>
                ({
                  ...row,
                  [entityAttributesProperty]: definedAttributesOf(
                    row[entityAttributesProperty],
                  ),
                }) as NcNode,
            ),
          ]),
        );

  const resolvedConfig = resolveGenerationConfig(config);
  // A pedigree sizes itself. No protocol-level constraint caps it: the
  // codebook describes what a family IS, not how big one gets, and the
  // stage-level `synthetic` counts belong to interfaces that size a population
  // rather than build a structure. What remains is the engine's own bound on
  // optional branches, which a caller may raise or lower through its own
  // options; the generator's seven-person core stands under either.
  const resolvedFamilyPedigree = resolveFamilyPedigreeGenerationOptions(
    familyPedigree,
    DEFAULT_PEDIGREE_NODE_CEILING,
  );

  const feasibilityStages = reachableStagesForFeasibility(
    stages,
    respectSkipLogicAndFiltering,
  );

  // A reachable NetworkComposer field carries the control it renders its
  // variable with. Where an ordinary form also renders that variable through
  // the codebook control, the generated value must satisfy both. Fold their
  // common domain into the codebook before anything reads it; see
  // `applyComposerRenderings`.
  const composed = applyComposerRenderings(
    codebook,
    feasibilityStages,
    resolvedConfig.today,
  );
  if (composed.conflicts.length > 0) {
    throw new SyntheticDataConstraintError(
      composed.conflicts,
      COMPOSER_RENDERING_CONFLICT.summary,
    );
  }
  const renderedCodebook = composed.codebook;

  // A stage skip logic proves unreachable contributes nothing to the plan.
  // Planning a share of a node type's population for one would leave that
  // share unbuilt — materialisation skips the stage and does not reallocate to
  // a later creator — so the finished network would sit below its declared
  // population, and the `unique` values that share claimed would be spent on
  // people the session never holds. Indexes are preserved, because every
  // consumer of the analysis addresses stages by position.
  const reachableIndexes = new Set<number>();
  const reachable = new Set(feasibilityStages);
  stages.forEach((stage, index) => {
    if (reachable.has(stage)) reachableIndexes.add(index);
  });
  const effects = analyseStageEffects(stages, reachableIndexes);

  // Refused before anything is drawn, and before the seed is consulted: a
  // protocol whose declared rules no value can satisfy fails the same way on
  // every seed rather than only on the ones that happen to reach the
  // contradiction.
  const conflicts = analyseFeasibility(
    renderedCodebook,
    feasibilityStages,
    deriveFeasibilityConfig(
      renderedCodebook,
      effects,
      resolvedConfig.today,
      resolvedFamilyPedigree.maxNodes,
      // The reachable subset, matching `effects` and `feasibilityStages`. A
      // pedigree the run provably skips builds nobody, and counting its people
      // raised the topology ceiling enough to refuse a feasible protocol.
      familyPedigreePopulationByType(
        codebook,
        feasibilityStages,
        // Resolved exactly as the materialiser resolves it, so what is counted
        // and what is built cannot disagree.
        Math.max(resolvedFamilyPedigree.maxNodes, MINIMUM_PEDIGREE_CORE),
      ),
    ),
    externalData,
    respectSkipLogicAndFiltering,
    resolvedFamilyPedigree,
  );
  if (conflicts.length > 0) {
    throw new SyntheticDataConstraintError(conflicts);
  }

  const runSeed = seed ?? Math.floor(Math.random() * 100000);
  const valueGen = new ValueGenerator(runSeed, resolvedConfig.today);

  // The same variable ids that feasibility declined to analyse must also be
  // drawn without their rules, or the draw exhausts a value space no rule was
  // ever going to be enforced against.
  const binOnly = collectBinOnlyVariables(feasibilityStages);

  const constraintsByType = (
    definitions: StructuralCodebook['node'] | StructuralCodebook['edge'],
  ): Map<string, EntityConstraints> =>
    new Map(
      Object.entries(definitions ?? {}).map(([type, definition]) => [
        type,
        buildEntityConstraints(
          definition.variables,
          resolvedConfig.today,
          binOnly.get(type),
        ),
      ]),
    );

  // The rendered codebook throughout, so no reader can pick up a control the
  // interview will not use. Ego is untouched by it: a composer's subject is
  // always a node, and its edge forms name edge types.
  const ctx: GenerationContext = {
    codebook: renderedCodebook,
    valueGen,
    config: resolvedConfig,
    usedRosterUids: new Set<string>(),
    externalData,
    respectSkipLogicAndFiltering,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints: {
      ego: buildEntityConstraints(
        renderedCodebook.ego?.variables,
        resolvedConfig.today,
      ),
      node: constraintsByType(renderedCodebook.node),
      edge: constraintsByType(renderedCodebook.edge),
    },
  };

  // A pedigree's ego flag, biological sexes and relationship types are fixed
  // by the specialist generator during the walk rather than drawn in the plan,
  // so nothing else holds them back. Reserve them before planning, for the
  // same reason the plan reserves a prompt's fixed values and a roster's rows:
  // a free draw that took one of these would leave the network holding it
  // twice once the family is built, which `unique` forbids and nothing
  // downstream repairs. Reservations are soft, so a draw with nothing else
  // left still takes one.
  // The reachable subset, matching `effects` and feasibility. A pedigree the
  // run provably skips never materialises, so a value reserved for it is never
  // consumed and never released — it just holds a value back from the draws
  // that DO happen, and an unreachable pedigree could decide what an ordinary
  // edge of the same type ends up with.
  reserveFamilyPedigreeFixedValues(ctx, feasibilityStages);

  const plan = planNetwork(ctx, effects);

  return materialiseSession({
    ctx,
    effects,
    plan,
    stages,
    simulateDropOut,
    inProgressStageIndex,
    reachableStages: feasibilityStages,
    runSeed,
    familyPedigree: resolvedFamilyPedigree,
  });
}
