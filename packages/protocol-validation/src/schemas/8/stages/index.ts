import { z } from "~/utils/zod-mock-extension";

// Export base stage schema
export * from "./base";

// Import all stage types
import { faker } from "@faker-js/faker";
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
const stageSchemas = [
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
] as const;

// Combine all stage types
export const stageSchema = z.discriminatedUnion("type", stageSchemas).generateMock(() => {
	// pick a random schema
	const schema = faker.helpers.arrayElement(stageSchemas);
	return schema.generateMock();
});

// Extract all the 'type' values from stageSchema
export type StageType = z.infer<typeof stageSchema>["type"];

export type Stage = z.infer<typeof stageSchema>;
export type Prompt = Extract<Stage, { prompts: unknown }>["prompts"][number];
