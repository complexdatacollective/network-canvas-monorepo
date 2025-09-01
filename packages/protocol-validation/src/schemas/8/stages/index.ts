import { z } from "zod";

// Export base stage schema
export * from "./base";

// Import all stage types
import { egoFormStage, alterFormStage, alterEdgeFormStage } from "./form-stages";
import { nameGeneratorStage, nameGeneratorQuickAddStage, nameGeneratorRosterStage } from "./name-generator-stages";
import { sociogramStage, narrativeStage } from "./visualization-stages";
import {
	dyadCensusStage,
	tieStrengthCensusStage,
	oneToManyDyadCensusStage,
	familyTreeCensusStage,
} from "./census-stages";
import { ordinalBinStage, categoricalBinStage } from "./bin-stages";
import { informationStage, anonymisationStage } from "./information-stages";
import { geospatialStage } from "./geospatial-stages";

// Re-export individual stages
export * from "./form-stages";
export * from "./name-generator-stages";
export * from "./visualization-stages";
export * from "./census-stages";
export * from "./bin-stages";
export * from "./information-stages";
export * from "./geospatial-stages";

// Combine all stage types
export const stageSchema = z.discriminatedUnion("type", [
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
]);

// Extract all the 'type' values from stageSchema
export type StageType = z.infer<typeof stageSchema>["type"];

export type Stage = z.infer<typeof stageSchema>;
export type Prompt = Extract<Stage, { prompts: unknown }>["prompts"][number];
