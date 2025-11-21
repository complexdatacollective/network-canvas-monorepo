import type { StageType } from "@codaco/protocol-validation";
import type { ComponentType } from "react";
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
} from "~/components/sections";
import { FilteredNodeType } from "~/components/sections/NodeType";

/**
 * Common props that all stage editor section components can receive.
 * Not all sections use all props - they are provided by the StageEditor
 * component when rendering sections.
 */
export type StageEditorSectionProps = {
	/** Redux form name (e.g., "edit-stage") */
	form?: string;
	/** Path to stage in Redux state (e.g., "stages[0]") */
	stagePath?: string | null;
	/** Type of the interface/stage being edited */
	interfaceType?: string;
};

/**
 * Type for stage editor section components.
 * Uses ComponentType<any> to allow for various section-specific props
 * while still being able to receive the common StageEditorSectionProps.
 * The any type is necessary here because sections have diverse prop requirements
 * and may be wrapped with HOCs that add additional props.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SectionComponent = ComponentType<any>;

/**
 * Configuration for a stage editor interface.
 */
export type InterfaceConfig = {
	/** Array of section components to render in the editor */
	readonly sections: readonly SectionComponent[];
	/** URL to documentation for this interface type */
	readonly documentation: string;
	/** Optional display name override for the interface */
	readonly name?: string;
	/**
	 * Optional template object containing default configuration values
	 * that will be merged into the initial stage values when creating
	 * a new stage of this type. Commonly used for setting default behaviors.
	 */
	readonly template?: Record<string, unknown>;
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
 */
export const INTERFACE_CONFIGS = {
	AlterEdgeForm: {
		sections: [FilteredEdgeType, IntroductionPanel, Form, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/per-alter-edge-form/",
		template: {},
	},
	AlterForm: {
		sections: [FilteredNodeType, IntroductionPanel, Form, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/per-alter-form/",
	},
	CategoricalBin: {
		sections: [FilteredNodeType, CategoricalBinPrompts, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/categorical-bin/",
	},
	DyadCensus: {
		sections: [FilteredNodeType, IntroductionPanel, DyadCensusPrompts, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/dyad-census/",
	},
	OneToManyDyadCensus: {
		sections: [FilteredNodeType, RemoveAfterConsideration, OneToManyDyadCensusPrompts, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/one-to-many-dyad-census/",
		template: {
			behaviours: {
				removeAfterConsideration: true,
			},
		},
	},
	EgoForm: {
		sections: [IntroductionPanel, Form, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/ego-form/",
		template: {},
	},
	Information: {
		sections: [Title, ContentGrid, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/information/",
	},
	NameGenerator: {
		sections: [NodeType, Form, NameGeneratorPrompts, NodePanels, SkipLogic, MinMaxAlterLimits, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/name-generator-using-forms/",
		name: "Name Generator (using forms)",
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
		documentation: "https://documentation.networkcanvas.com/interface-documentation/name-generator-roster/",
		name: "Name Generator for Roster Data",
	},
	NameGeneratorQuickAdd: {
		sections: [NodeType, QuickAdd, NameGeneratorPrompts, NodePanels, SkipLogic, MinMaxAlterLimits, InterviewScript],
		name: "Name Generator (quick add)",
		documentation: "https://documentation.networkcanvas.com/interface-documentation/name-generator-using-quick-add/",
	},
	Narrative: {
		sections: [FilteredNodeType, Background, NarrativePresets, NarrativeBehaviours, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/narrative/",
		template: {
			behaviours: {
				allowRepositioning: true,
			},
		},
	},
	OrdinalBin: {
		sections: [FilteredNodeType, OrdinalBinPrompts, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/ordinal-bin/",
	},
	Sociogram: {
		sections: [FilteredNodeType, Background, AutomaticLayout, SociogramPrompts, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/sociogram/",
	},
	TieStrengthCensus: {
		sections: [FilteredNodeType, IntroductionPanel, TieStrengthCensusPrompts, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/tie-strength-census/",
	},
	Geospatial: {
		sections: [FilteredNodeType, IntroductionPanel, MapOptions, GeospatialPrompts, SkipLogic, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/geospatial/",
	},
	Anonymisation: {
		sections: [AnonymisationExplanation, AnonymisationValidation, EncryptedVariables, InterviewScript],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/anonymisation/",
	},
	FamilyTreeCensus: {
		sections: [NodeType],
		documentation: "https://documentation.networkcanvas.com/interface-documentation/family-tree-census/",
		// Note: This interface is not yet fully implemented. Additional sections will be added as they are developed.
	},
} as const satisfies InterfaceRegistry;

/**
 * Retrieves the interface configuration for a given stage type.
 *
 * @param interfaceType - The stage type to get the configuration for
 * @returns The interface configuration object
 * @throws {Error} If the interface type is not recognized
 *
 * @example
 * const config = getInterface("NameGenerator");
 * // Returns: { sections: [...], documentation: "...", name: "Name Generator (using forms)" }
 */
export function getInterface(interfaceType: StageType): InterfaceConfig {
	const config = INTERFACE_CONFIGS[interfaceType];

	if (!config) {
		throw new Error(
			`Unknown interface type: "${interfaceType}". Valid types are: ${Object.keys(INTERFACE_CONFIGS).join(", ")}`,
		);
	}

	return config;
}
