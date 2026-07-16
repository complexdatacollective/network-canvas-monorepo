import { z } from 'zod';

// Export base stage schema
export * from './base.ts';

// Import all stage types
import { alterEdgeFormStage } from './alter-edge-form.ts';
import { alterFormStage } from './alter-form.ts';
import { anonymisationStage } from './anonymisation.ts';
import { categoricalBinStage } from './categorical-bin.ts';
import { dyadCensusStage } from './dyad-census.ts';
import { egoFormStage } from './ego-form.ts';
import { familyPedigreeStage } from './family-pedigree.ts';
import { geospatialStage } from './geospatial.ts';
import { informationStage } from './information.ts';
import { nameGeneratorQuickAddStage } from './name-generator-quick-add.ts';
import { nameGeneratorRosterStage } from './name-generator-roster.ts';
import { nameGeneratorStage } from './name-generator.ts';
import { narrativePedigreeStage } from './narrative-pedigree.ts';
import { narrativeStage } from './narrative.ts';
import { networkComposerStage } from './network-composer.ts';
import { oneToManyDyadCensusStage } from './one-to-many-dyad-census.ts';
import { ordinalBinStage } from './ordinal-bin.ts';
import { sociogramStage } from './sociogram.ts';
import { tieStrengthCensusStage } from './tie-strength-census.ts';

// Re-export individual stages
export * from './alter-edge-form.ts';
export * from './alter-form.ts';
export * from './anonymisation.ts';
export * from './categorical-bin.ts';
export * from './dyad-census.ts';
export * from './ego-form.ts';
export * from './family-pedigree.ts';
export * from './geospatial.ts';
export * from './information.ts';
export * from './name-generator.ts';
export * from './name-generator-quick-add.ts';
export * from './name-generator-roster.ts';
export * from './narrative-pedigree.ts';
export * from './narrative.ts';
export * from './network-composer.ts';
export * from './one-to-many-dyad-census.ts';
export * from './ordinal-bin.ts';
export * from './sociogram.ts';
export * from './tie-strength-census.ts';

// Combine all stage types
const stageSchemas = [
  egoFormStage,
  alterFormStage,
  alterEdgeFormStage,
  nameGeneratorStage,
  nameGeneratorQuickAddStage,
  nameGeneratorRosterStage,
  sociogramStage,
  networkComposerStage,
  dyadCensusStage,
  tieStrengthCensusStage,
  ordinalBinStage,
  categoricalBinStage,
  narrativeStage,
  informationStage,
  anonymisationStage,
  oneToManyDyadCensusStage,
  familyPedigreeStage,
  geospatialStage,
  narrativePedigreeStage,
] as const;

// Combine all stage types
export const stageSchema = z.discriminatedUnion('type', stageSchemas);

// Extract all the 'type' values from stageSchema
export type StageType = z.infer<typeof stageSchema>['type'];

export type Stage = z.infer<typeof stageSchema>;
export type Prompt = Extract<Stage, { prompts: unknown }>['prompts'][number];
