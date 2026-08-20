import { v4 as uuid } from 'uuid';

import {
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import { reservePromptFixedValues } from './generateNetwork/attributes';
import {
  type GenerationConfig,
  resolveGenerationConfig,
} from './generateNetwork/config';
import { collectBinOnlyVariables } from './generateNetwork/constraints/binOnlyVariables';
import { buildEntityConstraints } from './generateNetwork/constraints/buildConstraints';
import { SyntheticDataConstraintError } from './generateNetwork/constraints/error';
import { analyseFeasibility } from './generateNetwork/constraints/feasibility';
import { reachableStagesForFeasibility } from './generateNetwork/constraints/reachableStages';
import type { EntityConstraints } from './generateNetwork/constraints/types';
import { UniqueRegistry } from './generateNetwork/constraints/uniqueRegistry';
import { isContentStage } from './generateNetwork/contentStages';
import type {
  GenerationContext,
  NetworkDraft,
} from './generateNetwork/context';
import { buildCurrentNetwork } from './generateNetwork/filtering';
import { markStageInProgress } from './generateNetwork/inProgress';
import {
  countPromptFixedValues,
  releaseExternalRosterValues,
  reserveExternalRosterValues,
} from './generateNetwork/nodes';
import {
  handleAlterEdgeForm,
  handleAlterForm,
  handleCategoricalBin,
  handleDyadCensus,
  handleEgoForm,
  handleGeospatial,
  handleNameGenerators,
  handleNetworkComposer,
  handleOrdinalBin,
  handleSociogram,
  handleTieStrengthCensus,
} from './generateNetwork/stageHandlers';
import {
  applyComposerRenderings,
  COMPOSER_RENDERING_CONFLICT,
} from './synthetic-interviews/constraints/composerRenderings';
import { materializeFamilyPedigree } from './synthetic-interviews/simulators/familyPedigree/materializeFamilyPedigree';
import { resolveFamilyPedigreeGenerationOptions } from './synthetic-interviews/simulators/familyPedigree/referencePopulation';
import { reserveFamilyPedigreeFixedValues } from './synthetic-interviews/simulators/familyPedigree/reservations';
import { familyPedigreeSeed } from './synthetic-interviews/simulators/familyPedigree/seed';
import type { FamilyPedigreeGenerationOptions } from './synthetic-interviews/simulators/familyPedigree/types';
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
   * while a name generator still fabricates to its node counts via its manual
   * add path. A **non-empty** array draws from those rows (a roster stage only
   * from them; a name generator mixes them with fabricated people).
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
  /** Overrides for generation tuning constants. See {@link GenerationConfig}. */
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

  const baseConfig = resolveGenerationConfig(config);
  const resolvedFamilyPedigree = resolveFamilyPedigreeGenerationOptions(
    familyPedigree,
    Math.max(
      baseConfig.familyPedigreeNodeCount.min,
      baseConfig.familyPedigreeNodeCount.max,
    ),
  );
  const resolvedConfig = {
    ...baseConfig,
    familyPedigreeNodeCount: {
      min: 7,
      max: resolvedFamilyPedigree.maxNodes,
    },
  };

  const feasibilityStages = reachableStagesForFeasibility(
    codebook,
    stages,
    respectSkipLogicAndFiltering,
  );

  // A reachable NetworkComposer field carries the control it renders its
  // variable with. Where an ordinary form also renders that variable through
  // the codebook control, the generated value must satisfy both. Fold their
  // common domain into the codebook before anything reads it, so the count and
  // the draw are given the same one; see `applyComposerRenderings`.
  //
  // Its own refusal comes first and alone: where reachable controls have no
  // common window at one resolution there is nothing for feasibility to say
  // about the variable yet.
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

  // Refused before anything is drawn, and before the seed is consulted: a
  // protocol whose declared rules no value can satisfy fails the same way on
  // every seed rather than only on the ones that happen to reach the
  // contradiction. The roster rows go in because they bound how many people a
  // roster stage can add, and a stage that adds none needs no values at all.
  const conflicts = analyseFeasibility(
    renderedCodebook,
    feasibilityStages,
    resolvedConfig,
    externalData,
    respectSkipLogicAndFiltering,
    resolvedFamilyPedigree,
  );
  if (conflicts.length > 0) {
    throw new SyntheticDataConstraintError(conflicts);
  }

  const runSeed = seed ?? Math.floor(Math.random() * 100000);
  const valueGen = new ValueGenerator(runSeed, resolvedConfig.today);

  // Read once and applied to both the node and the edge codebook: the same
  // variable ids that feasibility declined to analyse must also be drawn
  // without their rules, or the draw exhausts a value space no rule was ever
  // going to be enforced against. No edge type can hold one (both binning
  // stages take a node subject), so the edge map simply never matches.
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

  // Before the first stage runs, so a value a later prompt fixes is out of the
  // way of the draws that come before it. Feasibility has already refused the
  // protocols where no assignment works, so what is left here is the ones where
  // a different draw is all that was needed.
  reservePromptFixedValues(
    ctx,
    countPromptFixedValues(stages, resolvedConfig, externalData),
  );
  // A pedigree's ego flag and its edges' relationship values are fixed by its
  // stage rather than by a prompt, and are held back here for the same reason.
  reserveFamilyPedigreeFixedValues(ctx, stages);
  // Roster rows are values the run is handed rather than ones it issues, so the
  // draws that come before their stage are steered off them here too. Each
  // stage's hold is given back once the stage has run.
  reserveExternalRosterValues(ctx, stages);

  const draft: NetworkDraft = {
    egoUid: uuid(),
    egoAttributes: {},
    nodes: [],
    edges: [],
    stageMetadata: {},
  };

  const totalStages = stages.length;
  let currentStep = 0;
  let droppedOut = false;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    // Captured before the switch narrows `stage`, so the exhaustive-default
    // branch can still name an unsupported runtime type.
    const stageType = stage.type;

    if (respectSkipLogicAndFiltering && stage.skipLogic) {
      const { skipLogic } = stage;
      if (isStageSkipped(skipLogic, buildCurrentNetwork(draft))) {
        // A stage that is skipped draws nobody, so the people its roster held
        // back are people nobody is waiting for.
        releaseExternalRosterValues(ctx, stage);
        const { destination } = skipLogic;
        if (destination) {
          const destinationIndex = resolveSkipLogicDestinationIndex(
            destination,
            stages,
            i,
          );
          if (destinationIndex !== undefined) {
            i = destinationIndex - 1;
          }
        }
        continue;
      }
    }

    if (simulateDropOut) {
      const dropOutChance = ((i + 1) / totalStages) * ctx.config.dropOutFactor;
      if (valueGen.randomFloat(0, 1) < dropOutChance) {
        droppedOut = true;
        currentStep = i;
        break;
      }
    }

    // Content stages run no handler at all: they add no node or edge and write
    // onto none. NarrativePedigree is one of them because it reads the shared
    // network its source FamilyPedigree stage already wrote.
    //
    // Narrowed away here rather than cased below, so that `CONTENT_STAGE_TYPES`
    // and this dispatch cannot come to disagree about what a stage does — which
    // matters because `analyseFeasibility` reads that list to tell a type only
    // such a stage names from one carrying generated values. Teaching one of
    // them to write would stop type-checking as a `case`, and dropping one from
    // the list sends it into the switch, where it is refused as unsupported.
    if (!isContentStage(stage)) {
      switch (stage.type) {
        case 'NameGenerator':
        case 'NameGeneratorQuickAdd':
        case 'NameGeneratorRoster':
          handleNameGenerators(ctx, draft, stage);
          break;
        case 'Sociogram':
          handleSociogram(ctx, draft, stage);
          break;
        case 'DyadCensus':
        case 'OneToManyDyadCensus':
          handleDyadCensus(ctx, draft, stage, i);
          break;
        case 'TieStrengthCensus':
          handleTieStrengthCensus(ctx, draft, stage, i);
          break;
        case 'OrdinalBin':
          handleOrdinalBin(ctx, draft, stage);
          break;
        case 'CategoricalBin':
          handleCategoricalBin(ctx, draft, stage);
          break;
        case 'EgoForm':
          handleEgoForm(ctx, draft);
          break;
        case 'AlterForm':
          handleAlterForm(ctx, draft, stage);
          break;
        case 'AlterEdgeForm':
          handleAlterEdgeForm(ctx, draft, stage);
          break;
        case 'FamilyPedigree':
          materializeFamilyPedigree(
            ctx,
            draft,
            stage,
            i,
            stages,
            feasibilityStages,
            familyPedigreeSeed(runSeed, stage.id),
            resolvedFamilyPedigree,
          );
          break;
        case 'Geospatial':
          handleGeospatial(ctx, draft, stage);
          break;
        case 'NetworkComposer':
          handleNetworkComposer(ctx, draft, stage);
          break;
        default:
          throw new Error(
            `Unsupported stage type "${stageType}". ` +
              'Synthetic data generation does not yet support this stage type.',
          );
      }
    }

    releaseExternalRosterValues(ctx, stage);
  }

  // Applied as a post-pass: node creation populates every codebook variable, and
  // later stages may rewrite the same variable, so values must be cleared after
  // all stages have run.
  const inProgressStage =
    inProgressStageIndex !== undefined
      ? stages[inProgressStageIndex]
      : undefined;
  if (inProgressStage) {
    markStageInProgress(ctx, draft, inProgressStage);
  }

  if (!droppedOut) {
    currentStep = totalStages;
  }

  return {
    network: buildCurrentNetwork(draft),
    stageMetadata:
      Object.keys(draft.stageMetadata).length > 0 ? draft.stageMetadata : null,
    currentStep,
    droppedOut,
  };
}
