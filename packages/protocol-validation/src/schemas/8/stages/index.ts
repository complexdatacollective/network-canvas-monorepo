import { z } from "~/utils/zod-mock-extension";

// Export base stage schema
export * from "./base";

// Import all stage types
import { faker } from "@faker-js/faker";
import { alterEdgeFormStage } from "./alter-edge-form";
import { alterFormStage } from "./alter-form";
import { anonymisationStage } from "./anonymisation";
import { categoricalBinStage } from "./categorical-bin";
import { dyadCensusStage } from "./dyad-census";
import { egoFormStage } from "./ego-form";
import { familyTreeCensusStage } from "./family-tree-census";
import { geospatialStage } from "./geospatial";
import { informationStage } from "./information";
import { nameGeneratorStage } from "./name-generator";
import { nameGeneratorQuickAddStage } from "./name-generator-quick-add";
import { nameGeneratorRosterStage } from "./name-generator-roster";
import { narrativeStage } from "./narrative";
import { oneToManyDyadCensusStage } from "./one-to-many-dyad-census";
import { ordinalBinStage } from "./ordinal-bin";
import { sociogramStage } from "./sociogram";
import { tieStrengthCensusStage } from "./tie-strength-census";

// Re-export individual stages
export * from "./alter-edge-form";
export * from "./alter-form";
export * from "./anonymisation";
export * from "./categorical-bin";
export * from "./dyad-census";
export * from "./ego-form";
export * from "./family-tree-census";
export * from "./geospatial";
export * from "./information";
export * from "./name-generator";
export * from "./name-generator-quick-add";
export * from "./name-generator-roster";
export * from "./narrative";
export * from "./one-to-many-dyad-census";
export * from "./ordinal-bin";
export * from "./sociogram";
export * from "./tie-strength-census";

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
