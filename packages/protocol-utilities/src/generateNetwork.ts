import type {
  Stage,
  StructuralCodebook,
  SyntheticCount,
} from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import { analyseStageEffects } from './generateNetwork/analyse/stageEffects';
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
import type { FamilyPedigreeGenerationOptions } from './generateNetwork/familyPedigree/types';
import { materialiseSession } from './generateNetwork/materialise/materialiseSession';
import { planNetwork } from './generateNetwork/plan/networkPlan';
import { resolveNodeCount } from './generateNetwork/plan/resolveSynthetic';
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

/** A ceiling no draw from the descriptor can exceed (six sigma for the open
 * families), for seed-independent worst-case feasibility counting. */
function countCeiling(count: SyntheticCount): number {
  switch (count.distribution) {
    case 'constant':
      return count.value;
    case 'uniform':
      return count.max;
    case 'poisson':
      return count.max ?? Math.ceil(count.mean + 6 * Math.sqrt(count.mean) + 1);
    case 'normal':
      return count.max ?? Math.max(0, Math.ceil(count.mean + 6 * count.sd));
  }
}

/**
 * How large an undeclared family may grow. A pedigree sizes itself from its
 * population profile rather than from a count, so this only caps its optional
 * branches.
 */
const DEFAULT_PEDIGREE_NODE_CEILING = 32;

/**
 * The largest family a FamilyPedigree stage may build, taken from the declared
 * count of the node type it builds one from.
 *
 * Where several pedigree stages name different node types, the largest wins:
 * the value bounds what any of them could draw, and the generator's own
 * seven-person core keeps a small declared count from making a family
 * impossible.
 */
function familyPedigreeNodeCeiling(
  codebook: StructuralCodebook,
  stages: Stage[],
): number {
  let ceiling = 0;
  for (const stage of stages) {
    if (stage.type !== 'FamilyPedigree') continue;
    const type = stage.nodeConfig?.type;
    const definition = type === undefined ? undefined : codebook.node?.[type];
    if (definition === undefined) continue;
    // Only a DECLARED count applies. The generic node default (1–8) describes
    // how many people a name generator elicits, which says nothing about a
    // family: a pedigree's core is seven people before any optional branch,
    // so defaulting to it would cap every undeclared pedigree below its own
    // minimum.
    const declared = definition.synthetic?.count !== undefined;
    ceiling = Math.max(
      ceiling,
      declared
        ? countCeiling(resolveNodeCount(definition, { creatable: true }))
        : DEFAULT_PEDIGREE_NODE_CEILING,
    );
  }
  return ceiling;
}

/**
 * Worst-case bounds feasibility counts against, derived from the codebook's
 * declared populations. Edge probabilities pin at 1: a declared density may
 * reach every eligible pair, and refusals must stay conservative.
 */
function deriveFeasibilityConfig(
  codebook: StructuralCodebook,
  creatableNodeTypes: ReadonlySet<string>,
  today: string,
  pedigreeCeiling: number,
): FeasibilityConfig {
  let nodeCap = 1;
  const nodeCountByType: Record<string, { min: number; max: number }> = {};
  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    const ceiling = countCeiling(
      resolveNodeCount(definition, {
        creatable: creatableNodeTypes.has(type),
      }),
    );
    nodeCountByType[type] = { min: 0, max: ceiling };
    nodeCap = Math.max(nodeCap, ceiling);
  }
  return {
    nodeCount: { min: 0, max: nodeCap },
    nodeCountByType,
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
    externalData,
    seed,
    simulateDropOut = false,
    respectSkipLogicAndFiltering = false,
    inProgressStageIndex,
    config,
    familyPedigree,
  } = params;

  const resolvedConfig = resolveGenerationConfig(config);
  // How large a family may get is a property of the pedigree's node type, so
  // it comes from that type's declared count rather than from a tuning knob.
  // The family-specific generator treats it as a ceiling on optional
  // branches; its seven-person core stands whatever the codebook says.
  const resolvedFamilyPedigree = resolveFamilyPedigreeGenerationOptions(
    familyPedigree,
    familyPedigreeNodeCeiling(codebook, stages),
  );

  const feasibilityStages = reachableStagesForFeasibility(
    codebook,
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

  const effects = analyseStageEffects(stages);

  // Refused before anything is drawn, and before the seed is consulted: a
  // protocol whose declared rules no value can satisfy fails the same way on
  // every seed rather than only on the ones that happen to reach the
  // contradiction.
  const conflicts = analyseFeasibility(
    renderedCodebook,
    feasibilityStages,
    deriveFeasibilityConfig(
      renderedCodebook,
      effects.creatableNodeTypes,
      resolvedConfig.today,
      resolvedFamilyPedigree.maxNodes,
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
