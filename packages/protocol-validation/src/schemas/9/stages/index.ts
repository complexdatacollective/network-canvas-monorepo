import { faker } from "@faker-js/faker";
import { z } from "~/utils/zod-mock-extension";

export * from "./base";

import { alterEdgeFormStageEntity } from "./alter-edge-form";
import { alterFormStageEntity } from "./alter-form";
import { anonymisationStageEntity } from "./anonymisation";
import { categoricalBinStageEntity } from "./categorical-bin";
import { dyadCensusStageEntity } from "./dyad-census";
import { egoFormStageEntity } from "./ego-form";
import { familyPedigreeStageEntity } from "./family-pedigree";
import { finishInterviewStageEntity } from "./finish-interview";
import { geospatialStageEntity } from "./geospatial";
import { informationStageEntity } from "./information";
import { nameGeneratorStageEntity } from "./name-generator";
import { nameGeneratorQuickAddStageEntity } from "./name-generator-quick-add";
import { nameGeneratorRosterStageEntity } from "./name-generator-roster";
import { narrativeStageEntity } from "./narrative";
import { oneToManyDyadCensusStageEntity } from "./one-to-many-dyad-census";
import { ordinalBinStageEntity } from "./ordinal-bin";
import { sociogramStageEntity } from "./sociogram";
import { tieStrengthCensusStageEntity } from "./tie-strength-census";

export * from "./alter-edge-form";
export * from "./alter-form";
export * from "./anonymisation";
export * from "./categorical-bin";
export * from "./dyad-census";
export * from "./ego-form";
export * from "./family-pedigree";
export * from "./finish-interview";
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

const stageEntitySchemas = [
	egoFormStageEntity,
	alterFormStageEntity,
	alterEdgeFormStageEntity,
	nameGeneratorStageEntity,
	nameGeneratorQuickAddStageEntity,
	nameGeneratorRosterStageEntity,
	sociogramStageEntity,
	dyadCensusStageEntity,
	tieStrengthCensusStageEntity,
	ordinalBinStageEntity,
	categoricalBinStageEntity,
	narrativeStageEntity,
	informationStageEntity,
	anonymisationStageEntity,
	oneToManyDyadCensusStageEntity,
	familyPedigreeStageEntity,
	geospatialStageEntity,
	finishInterviewStageEntity,
] as const;

export const stageEntitySchema = z.discriminatedUnion("stageType", stageEntitySchemas).generateMock(() => {
	const schema = faker.helpers.arrayElement(stageEntitySchemas);
	return schema.generateMock();
});

export type StageType = z.infer<typeof stageEntitySchema>["stageType"];
export type StageEntity = z.infer<typeof stageEntitySchema>;
export type Prompt = Extract<StageEntity, { prompts: unknown }>["prompts"][number];
