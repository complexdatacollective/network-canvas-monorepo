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
import type { EntityConstraints } from './generateNetwork/constraints/types';
import { UniqueRegistry } from './generateNetwork/constraints/uniqueRegistry';
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
  handleFamilyPedigree,
  handleGeospatial,
  handleNameGenerators,
  handleNetworkComposer,
  handleOrdinalBin,
  handleSociogram,
  handleTieStrengthCensus,
  reserveFamilyPedigreeEgoValues,
} from './generateNetwork/stageHandlers';
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
  } = params;

  const resolvedConfig = resolveGenerationConfig(config);

  // Refused before anything is drawn, and before the seed is consulted: a
  // protocol whose declared rules no value can satisfy fails the same way on
  // every seed rather than only on the ones that happen to reach the
  // contradiction. The roster rows go in because they bound how many people a
  // roster stage can add, and a stage that adds none needs no values at all.
  const conflicts = analyseFeasibility(
    codebook,
    stages,
    resolvedConfig,
    externalData,
  );
  if (conflicts.length > 0) {
    throw new SyntheticDataConstraintError(conflicts);
  }

  const valueGen = new ValueGenerator(
    seed ?? Math.floor(Math.random() * 100000),
    resolvedConfig.today,
  );

  // Read once and applied to both the node and the edge codebook: the same
  // variable ids that feasibility declined to analyse must also be drawn
  // without their rules, or the draw exhausts a value space no rule was ever
  // going to be enforced against. No edge type can hold one (both binning
  // stages take a node subject), so the edge map simply never matches.
  const binOnly = collectBinOnlyVariables(stages);

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

  const ctx: GenerationContext = {
    codebook,
    valueGen,
    config: resolvedConfig,
    usedRosterUids: new Set<string>(),
    externalData,
    respectSkipLogicAndFiltering,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints: {
      ego: buildEntityConstraints(
        codebook.ego?.variables,
        resolvedConfig.today,
      ),
      node: constraintsByType(codebook.node),
      edge: constraintsByType(codebook.edge),
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
  // A pedigree's ego flag is fixed by its stage rather than by a prompt, and is
  // held back here for the same reason.
  reserveFamilyPedigreeEgoValues(ctx, stages);
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
        handleFamilyPedigree(ctx, draft, stage, i);
        break;
      case 'Geospatial':
        handleGeospatial(ctx, draft, stage);
        break;
      case 'NetworkComposer':
        handleNetworkComposer(ctx, draft, stage);
        break;
      case 'Information':
      case 'Anonymisation':
      case 'Narrative':
      case 'NarrativePedigree':
        // Read-only / content stages add no nodes or edges. NarrativePedigree
        // reads the shared network written by its source FamilyPedigree stage.
        break;
      default:
        throw new Error(
          `Unsupported stage type "${stageType}". ` +
            'Synthetic data generation does not yet support this stage type.',
        );
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
