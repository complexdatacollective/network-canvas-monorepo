export type { GenerationConfig } from './generateNetwork/config';
export { US_FAMILY_PEDIGREE_POPULATION } from './generateNetwork/familyPedigree/referencePopulation';
export type {
  FamilyPedigreeDiseaseMode,
  FamilyPedigreeGenerationOptions,
  FamilyPedigreePopulationProfile,
  FamilyPedigreeScenario,
  FamilyPedigreeWeightedCount,
} from './generateNetwork/familyPedigree/types';
export type {
  GenerateNetworkParams,
  GenerateNetworkResult,
} from './generateNetwork';
export { generateNetwork } from './generateNetwork';
// The clock read behind `GenerationConfig.today`'s default, published so a
// host can reason about generated dates in the terms the generator produced
// them, and so @codaco/interview can hold it to fresco-ui's own clock read
// (src/forms/__tests__/ymdParity.test.ts).
export { todayYmd } from './generateNetwork/constraints/dateWindow';
export type { ConstraintConflict } from './generateNetwork/constraints/error';
export { SyntheticDataConstraintError } from './generateNetwork/constraints/error';
export {
  DEFAULT_SYNTHETIC_SEED,
  SyntheticInterview,
} from './SyntheticInterview';
// The single source of what absent `synthetic` metadata resolves to.
// Architect's variable editor initialises its synthetic section from the
// same resolution the generator draws with, so the UI's starting point is
// exactly what an undeclared protocol produces.
export {
  DEFAULT_EDGE_TOPOLOGY,
  defaultTopologyForStage,
  DEFAULT_NODE_COUNT,
  inferTextGenerator,
  type ResolvedVariableSynthetic,
  resolveVariableSynthetic,
} from './generateNetwork/plan/resolveSynthetic';
