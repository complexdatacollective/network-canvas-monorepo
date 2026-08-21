export type { GenerationConfig } from './generateNetwork/config';
export { US_FAMILY_PEDIGREE_POPULATION } from './synthetic-interviews/simulators/familyPedigree/referencePopulation';
export type {
  FamilyPedigreeDiseaseMode,
  FamilyPedigreeGenerationOptions,
  FamilyPedigreePopulationProfile,
  FamilyPedigreeScenario,
  FamilyPedigreeWeightedCount,
} from './synthetic-interviews/simulators/familyPedigree/types';
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
// The ceiling a caller may ask a single batch for. Published because it is a
// property of asking for synthetic data rather than of any one host, so the
// hosts' request schemas and count inputs read it from here rather than each
// keeping a number of their own (plan D1).
export { MAX_SYNTHETIC_INTERVIEWS } from './synthetic-interviews/constants';
export type {
  AssetData,
  SimulationContext,
  StageSimulator,
  SyntheticInterviewResult,
  SyntheticSessionAction,
} from './synthetic-interviews';
export {
  generateInterviews,
  generateInterviewsOptions,
  type GenerateInterviewsOptions,
} from './synthetic-interviews';
// The acceptance corpus: deterministic protocol shapes generated from an index
// rather than written by hand. Published because two packages hold oracles over
// the same shapes — this package's feasibility/validation corpus, and
// @codaco/interview's replay-parity suite (criterion C1) — and a corpus each
// would be two corpora that could drift.
export {
  type CorpusGenerator,
  type CorpusProtocol,
  type CorpusRoster,
  type CorpusShape,
  type CorpusVariable,
  generateCorpusProtocol,
} from './synthetic-interviews/corpus';
