import { v4 as uuid } from 'uuid';

import {
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import {
  type GenerationConfig,
  resolveGenerationConfig,
} from './generateNetwork/config';
import type {
  GenerationContext,
  NetworkDraft,
} from './generateNetwork/context';
import { buildCurrentNetwork } from './generateNetwork/filtering';
import { markStageInProgress } from './generateNetwork/inProgress';
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
   * A stage with no entry (or an empty/exhausted pool) falls back per stage
   * type: a roster stage adds nobody, while a name generator fabricates people.
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

  const valueGen = new ValueGenerator(
    seed ?? Math.floor(Math.random() * 100000),
  );

  const ctx: GenerationContext = {
    codebook,
    valueGen,
    config: resolveGenerationConfig(config),
    usedRosterUids: new Set<string>(),
    externalData,
    respectSkipLogicAndFiltering,
  };

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
