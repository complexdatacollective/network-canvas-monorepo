export type { GenerationConfig } from './generateNetwork/config.ts';
export { US_FAMILY_PEDIGREE_POPULATION } from './generateNetwork/familyPedigree/referencePopulation.ts';
export type {
  FamilyPedigreeDiseaseMode,
  FamilyPedigreeGenerationOptions,
  FamilyPedigreePopulationProfile,
  FamilyPedigreeScenario,
  FamilyPedigreeWeightedCount,
} from './generateNetwork/familyPedigree/types.ts';
export type {
  GenerateNetworkParams,
  GenerateNetworkResult,
} from './generateNetwork.ts';
export { generateNetwork } from './generateNetwork.ts';
// The clock read behind `GenerationConfig.today`'s default, published so a
// host can reason about generated dates in the terms the generator produced
// them, and so @codaco/interview can hold it to fresco-ui's own clock read
// (src/forms/__tests__/ymdParity.test.ts).
export { todayYmd } from './generateNetwork/constraints/dateWindow.ts';
export type { ConstraintConflict } from './generateNetwork/constraints/error.ts';
export { SyntheticDataConstraintError } from './generateNetwork/constraints/error.ts';
export {
  DEFAULT_SYNTHETIC_SEED,
  SyntheticInterview,
} from './SyntheticInterview.ts';
