export type { GenerationConfig } from './generateNetwork/config';
export type {
  GenerateNetworkParams,
  GenerateNetworkResult,
} from './generateNetwork';
export { generateNetwork } from './generateNetwork';
// The arithmetic behind `GenerationConfig.today` and every generated date
// string, published so a host can reason about generated dates in the terms the
// generator produced them — and so the one package that depends on both this
// and fresco-ui can hold the two duplicate implementations to the same results.
export { addDays, todayYmd } from './generateNetwork/constraints/dateWindow';
export type { ConstraintConflict } from './generateNetwork/constraints/error';
export { SyntheticDataConstraintError } from './generateNetwork/constraints/error';
export { SyntheticInterview } from './SyntheticInterview';
