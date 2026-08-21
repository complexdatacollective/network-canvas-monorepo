export { US_FAMILY_PEDIGREE_POPULATION } from './synthetic-interviews/simulators/familyPedigree/referencePopulation';
export type {
  FamilyPedigreeDiseaseMode,
  FamilyPedigreeGenerationOptions,
  FamilyPedigreePopulationProfile,
  FamilyPedigreeScenario,
  FamilyPedigreeWeightedCount,
} from './synthetic-interviews/simulators/familyPedigree/types';
export type { ConstraintConflict } from './synthetic-interviews/constraints/error';
export { SyntheticDataConstraintError } from './synthetic-interviews/constraints/error';
export { ProtocolBuilder } from './ProtocolBuilder';
// The seed a run falls back to and the ceiling a caller may ask a single
// batch for. Published because they are properties of asking for synthetic
// data rather than of any one host, so the hosts' request schemas and count
// inputs read them from here rather than each keeping a number of their own
// (plan D1).
export {
  DEFAULT_SYNTHETIC_SEED,
  MAX_SYNTHETIC_INTERVIEWS,
} from './synthetic-interviews/constants';
export type {
  AssetData,
  EdgeOverrideEntry,
  NodeOverrideEntry,
  SessionOverrides,
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
