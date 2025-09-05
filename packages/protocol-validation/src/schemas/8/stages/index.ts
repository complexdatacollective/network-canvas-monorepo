import { z } from "src/utils/zod-mock-extension";

// Export base stage schema
export * from "./base";

// Import all stage types
import { categoricalBinStage, ordinalBinStage } from "./bin-stages";
import {
	dyadCensusStage,
	familyTreeCensusStage,
	oneToManyDyadCensusStage,
	tieStrengthCensusStage,
} from "./census-stages";
import { alterEdgeFormStage, alterFormStage, egoFormStage } from "./form-stages";
import { geospatialStage } from "./geospatial-stages";
import { anonymisationStage, informationStage } from "./information-stages";
import { nameGeneratorQuickAddStage, nameGeneratorRosterStage, nameGeneratorStage } from "./name-generator-stages";
import { narrativeStage, sociogramStage } from "./visualization-stages";

// Re-export individual stages
export * from "./bin-stages";
export * from "./census-stages";
export * from "./form-stages";
export * from "./geospatial-stages";
export * from "./information-stages";
export * from "./name-generator-stages";
export * from "./visualization-stages";

// Combine all stage types
export const stageSchema = z
	.discriminatedUnion("type", [
		egoFormStage,
		alterFormStage,
		alterEdgeFormStage,
		nameGeneratorStage,
		nameGeneratorQuickAddStage,
		nameGeneratorRosterStage,
		sociogramStage,
		dyadCensusStage,
		tieStrengthCensusStage,
		ordinalBinStage,
		categoricalBinStage,
		narrativeStage,
		informationStage,
		anonymisationStage,
		oneToManyDyadCensusStage,
		familyTreeCensusStage,
		geospatialStage,
	])
	.generateMock(() => {
		// Weight the frequency of different stage types to create a more realistic protocol
		// todo: refine weights
		const stageWeights = [
			{ stage: informationStage, weight: 20, type: "Information" },
			{ stage: egoFormStage, weight: 15, type: "EgoForm" },
			{ stage: nameGeneratorStage, weight: 15, type: "NameGenerator" },
			{ stage: alterFormStage, weight: 10, type: "AlterForm" },
			{ stage: sociogramStage, weight: 10, type: "Sociogram" },
			{ stage: nameGeneratorQuickAddStage, weight: 8, type: "NameGeneratorQuickAdd" },
			{ stage: ordinalBinStage, weight: 5, type: "OrdinalBin" },
			{ stage: categoricalBinStage, weight: 5, type: "CategoricalBin" },
			{ stage: dyadCensusStage, weight: 4, type: "DyadCensus" },
			{ stage: nameGeneratorRosterStage, weight: 3, type: "NameGeneratorRoster" },
			{ stage: narrativeStage, weight: 2, type: "Narrative" },
			{ stage: tieStrengthCensusStage, weight: 1, type: "TieStrengthCensus" },
			{ stage: alterEdgeFormStage, weight: 1, type: "AlterEdgeForm" },
			{ stage: geospatialStage, weight: 1, type: "Geospatial" },
		];

		const totalWeight = stageWeights.reduce((sum, { weight }) => sum + weight, 0);
		let random = Math.random() * totalWeight;

		for (const { stage, weight } of stageWeights) {
			random -= weight;
			if (random <= 0) {
				return stage.generateMock();
			}
		}

		// Fallback to Information stage
		return informationStage.generateMock();
	});

// Extract all the 'type' values from stageSchema
export type StageType = z.infer<typeof stageSchema>["type"];

export type Stage = z.infer<typeof stageSchema>;
export type Prompt = Extract<Stage, { prompts: unknown }>["prompts"][number];
