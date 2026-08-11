import { startCase } from 'es-toolkit/compat';
import type { ComponentType } from 'react';

import type { StageType } from '@codaco/protocol-validation';
import {
  AnonymisationExplanation,
  AnonymisationValidation,
  AutomaticLayout,
  Background,
  CardDisplayOptions,
  CategoricalBinPrompts,
  ContentGrid,
  DyadCensusPrompts,
  EncryptedVariables,
  ExternalDataSource,
  FilteredEdgeType,
  Form,
  GeospatialPrompts,
  InterviewScript,
  IntroductionPanel,
  MapOptions,
  MinMaxAlterLimits,
  NameGeneratorPrompts,
  NameGeneratorRosterPrompts,
  NarrativeBehaviours,
  NarrativePresets,
  NodePanels,
  NodeType,
  OneToManyDyadCensusPrompts,
  OrdinalBinPrompts,
  QuickAdd,
  RemoveAfterConsideration,
  SearchOptionsForExternalData,
  SkipLogic,
  SociogramPrompts,
  SortOptionsForExternalData,
  TieStrengthCensusPrompts,
  Title,
} from '~/components/sections';
import EdgeConfiguration from '~/components/sections/EdgeConfiguration/EdgeConfiguration';
import BoundaryOptions from '~/components/sections/FamilyPedigree/BoundaryOptions';
import CensusPrompt from '~/components/sections/FamilyPedigree/CensusPrompt';
import FamilyPedigreeEdgeConfiguration from '~/components/sections/FamilyPedigree/EdgeConfiguration';
import FramingConfig from '~/components/sections/FamilyPedigree/FramingConfig';
import IntroScreen from '~/components/sections/FamilyPedigree/IntroScreen';
import FamilyPedigreeNodeConfiguration from '~/components/sections/FamilyPedigree/NodeConfiguration';
import NominationPrompts from '~/components/sections/FamilyPedigree/NominationPrompts';
import AtRiskStatuses from '~/components/sections/NarrativePedigree/AtRiskStatuses';
import Diseases from '~/components/sections/NarrativePedigree/Diseases';
import SourceStage from '~/components/sections/NarrativePedigree/SourceStage';
import NodeConfiguration from '~/components/sections/NodeConfiguration/NodeConfiguration';
import { FilteredNodeType } from '~/components/sections/NodeType';
import { interfaceDocumentationUrl } from '~/utils/documentationLinks';

import { getInterfaceTemplate } from './interfaceTemplates';

/**
 * Props that are passed to all stage editor section components.
 * These props are provided by the StageEditor component when rendering sections.
 * Individual section components may use some or all of these props.
 */
export type StageEditorSectionProps = {
  /** Redux form name (always "edit-stage") */
  form: string;
  /** Path to stage in Redux state (e.g., "stages[0]"), or null if creating a new stage */
  stagePath: string | null;
  /** Zero-based stage position, including the prospective insertion position */
  stagePosition: number;
  /** Type of the interface/stage being edited */
  interfaceType: StageType;
};

/**
 * Type for stage editor section components.
 * All section components must accept at least the StageEditorSectionProps.
 */
export type SectionComponent = ComponentType<StageEditorSectionProps>;

/**
 * Configuration for a stage editor interface.
 */
type InterfaceConfig = {
  /** Array of section components to render in the editor */
  readonly sections: readonly SectionComponent[];
  /** URL to documentation for this interface type */
  readonly documentation: string;
  /** Optional display name override for the interface */
  readonly name?: string;
};

/**
 * Registry of all stage editor interface configurations, keyed by stage type.
 */
type InterfaceRegistry = {
  readonly [K in StageType]: InterfaceConfig;
};

/**
 * Registry object containing configuration for all stage editor interfaces.
 * Each key corresponds to a stage type from the protocol validation schema.
 * Internal use only - not exported.
 */
const INTERFACE_CONFIGS: InterfaceRegistry = {
  AlterEdgeForm: {
    sections: [
      FilteredEdgeType,
      IntroductionPanel,
      Form,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('per-alter-edge-form'),
  },
  AlterForm: {
    sections: [
      FilteredNodeType,
      IntroductionPanel,
      Form,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('per-alter-form'),
  },
  CategoricalBin: {
    sections: [
      FilteredNodeType,
      CategoricalBinPrompts,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('categorical-bin'),
  },
  DyadCensus: {
    sections: [
      FilteredNodeType,
      IntroductionPanel,
      DyadCensusPrompts,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('dyad-census'),
  },
  OneToManyDyadCensus: {
    sections: [
      FilteredNodeType,
      RemoveAfterConsideration,
      OneToManyDyadCensusPrompts,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('one-to-many-dyad-census'),
  },
  EgoForm: {
    sections: [IntroductionPanel, Form, SkipLogic, InterviewScript],
    documentation: interfaceDocumentationUrl('ego-form'),
  },
  Information: {
    sections: [Title, ContentGrid, SkipLogic, InterviewScript],
    documentation: interfaceDocumentationUrl('information'),
  },
  NameGenerator: {
    sections: [
      NodeType,
      Form,
      NameGeneratorPrompts,
      NodePanels,
      SkipLogic,
      MinMaxAlterLimits,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('name-generator-using-forms'),
    name: 'Name Generator (using forms)',
  },
  NameGeneratorRoster: {
    sections: [
      NodeType,
      ExternalDataSource,
      CardDisplayOptions,
      SortOptionsForExternalData,
      SearchOptionsForExternalData,
      NameGeneratorRosterPrompts,
      SkipLogic,
      MinMaxAlterLimits,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('name-generator-roster'),
    name: 'Name Generator for Roster Data',
  },
  NameGeneratorQuickAdd: {
    sections: [
      NodeType,
      QuickAdd,
      NameGeneratorPrompts,
      NodePanels,
      SkipLogic,
      MinMaxAlterLimits,
      InterviewScript,
    ],
    name: 'Name Generator (quick add)',
    documentation: interfaceDocumentationUrl('name-generator-using-quick-add'),
  },
  Narrative: {
    sections: [
      FilteredNodeType,
      Background,
      NarrativePresets,
      NarrativeBehaviours,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('narrative'),
  },
  OrdinalBin: {
    sections: [FilteredNodeType, OrdinalBinPrompts, SkipLogic, InterviewScript],
    documentation: interfaceDocumentationUrl('ordinal-bin'),
  },
  Sociogram: {
    sections: [
      FilteredNodeType,
      Background,
      AutomaticLayout,
      SociogramPrompts,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('sociogram'),
  },
  NetworkComposer: {
    sections: [
      NodeType,
      NodeConfiguration,
      EdgeConfiguration,
      Background,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('network-composer'),
  },
  TieStrengthCensus: {
    sections: [
      FilteredNodeType,
      IntroductionPanel,
      TieStrengthCensusPrompts,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('tie-strength-census'),
  },
  Geospatial: {
    sections: [
      FilteredNodeType,
      MapOptions,
      GeospatialPrompts,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('geospatial'),
  },
  Anonymisation: {
    sections: [
      AnonymisationExplanation,
      AnonymisationValidation,
      EncryptedVariables,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('anonymisation'),
  },
  FamilyPedigree: {
    sections: [
      FramingConfig,
      BoundaryOptions,
      IntroScreen,
      FamilyPedigreeNodeConfiguration,
      FamilyPedigreeEdgeConfiguration,
      CensusPrompt,
      NominationPrompts,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('family-pedigree'),
  },
  NarrativePedigree: {
    sections: [
      SourceStage,
      Diseases,
      AtRiskStatuses,
      SkipLogic,
      InterviewScript,
    ],
    documentation: interfaceDocumentationUrl('narrative-pedigree'),
  },
};

/**
 * Retrieves the interface configuration for a given stage type.
 *
 * @param interfaceType - The stage type to get the configuration for
 * @returns The interface configuration object
 * @throws {Error} If the interface type is not recognized
 *
 * @example
 * const config = getInterface("NameGenerator");
 * // Returns: { sections: [
			...,
		], documentation: "...", name: "Name Generator (using forms)" }
 */
export function getInterface(interfaceType: StageType): InterfaceConfig & {
  readonly name: string;
  readonly template: Record<string, unknown>;
} {
  const config = INTERFACE_CONFIGS[interfaceType];

  if (!config) {
    throw new Error(
      `Unknown interface type: "${interfaceType}". Valid types are: ${Object.keys(INTERFACE_CONFIGS).join(', ')}`,
    );
  }

  return {
    ...config,
    name: config.name ?? startCase(interfaceType),
    template: getInterfaceTemplate(interfaceType),
  };
}
