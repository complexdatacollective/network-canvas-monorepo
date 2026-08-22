import { asEntityAttributeReference } from './schemas/8/entity-attribute-reference.ts';
import { getAssetMimeType } from './utils/asset-mime-type.ts';
import {
  type AssetReferenceHit,
  collectAssetReferences,
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
} from './utils/collectEntityAttributeReferences.ts';
import { describeProtocolFileError } from './utils/describeProtocolFileError.ts';
import {
  type ExtractedAsset,
  extractProtocol,
  extractProtocolFromZip,
  loadNetcanvasArchive,
  MAX_INFLATED_BYTES,
  NetcanvasInflationLimitError,
} from './utils/extractProtocol.ts';
import { hashProtocol } from './utils/hashProtocol.ts';
import {
  MalformedNetcanvasError,
  type MalformedNetcanvasReason,
} from './utils/malformedNetcanvasError.ts';
import {
  getVariableNamesFromNetwork,
  type Network,
  validateNames,
} from './utils/validateExternalData.ts';
import validateProtocol, {
  formatProtocolValidationIssues,
  ProtocolValidationError,
  type ProtocolValidationIssue,
  type ProtocolValidationResult,
} from './validation/validate-protocol.ts';

export {
  MigrationChain,
  type ProtocolMigration as Migration,
  protocolMigrations,
} from './migration/index.ts';
export * from './migration/errors.ts';
export {
  detectSchemaVersion,
  getMigrationInfo,
  type MigrationInfo,
  type MigrationNote,
  migrateProtocol,
  ProtocolMigrator,
  protocolMigrator,
} from './migration/migrate-protocol.ts';

// Export schema types and constants (Protocol, Codebook, etc)
export * from './schemas/index.ts';
export {
  findValidationContradictions,
  type ValidationContradiction,
} from './schemas/8/variables/validation-contradictions.ts';
export {
  collectVariableRoleHits,
  findVariableRoleConflicts,
  type VariableRoleConflict,
  type VariableRoleGroup,
  type VariableRoleHit,
} from './utils/findVariableRoleConflicts.ts';
// `findExclusiveVariableConflicts` stays internal: it exists to feed the
// protocol schema's own refinement and the repair below, and a host that wants
// to know whether a protocol is admissible should call `validateProtocol`.
export {
  type ExclusiveVariableSlot,
  findExclusiveVariableSlots,
  findInterfaceOwnedOptionBindings,
  type InterfaceOwnedOptionBinding,
} from './utils/findExclusiveVariableConflicts.ts';
export {
  type ConfigurationProblem,
  repairConfigurationConflicts,
} from './utils/repairConfigurationConflicts.ts';
export {
  type BinOnlyVariables,
  collectInterfaceImpliedRules,
  declaresTextGenerator,
  type EffectiveVariableRules,
  type InterfaceImpliedRules,
  inferTextGenerator,
  narrowVariableRules,
  type ResolvedBooleanSynthetic,
  type ResolvedCategoricalSynthetic,
  type ResolvedDatetimeSynthetic,
  type ResolvedNumberSynthetic,
  type ResolvedOrdinalSynthetic,
  type ResolvedScalarSynthetic,
  type ResolvedTextSynthetic,
  type ResolvedVariableSynthetic,
  resolveNumberWindow,
  resolveVariableSynthetic,
  SCALAR_DOMAIN,
  type SubjectInterfaceRules,
  type SyntheticResolvableVariable,
  syntheticSubjectKey,
} from './utils/resolveVariableSynthetic.ts';
// The population and pair ceilings generation plans against, and the support a
// declared count can actually reach. Named here because `shared/synthetic` and
// `schemas/8/synthetic/helpers.ts` sit below the schema barrel that carries
// everything else synthetic to the root.
export {
  MAX_SYNTHETIC_PAIRS,
  MAX_SYNTHETIC_POPULATION,
} from './shared/synthetic/helpers.ts';
export { syntheticCountSupport } from './schemas/8/synthetic/helpers.ts';
export {
  asEntityAttributeReference,
  type AssetReferenceHit,
  collectAssetReferences,
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  describeProtocolFileError,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  type ExtractedAsset,
  extractProtocol,
  extractProtocolFromZip,
  formatProtocolValidationIssues,
  getAssetMimeType,
  getVariableNamesFromNetwork,
  hashProtocol,
  loadNetcanvasArchive,
  MalformedNetcanvasError,
  type MalformedNetcanvasReason,
  MAX_INFLATED_BYTES,
  type Network,
  NetcanvasInflationLimitError,
  ProtocolValidationError,
  type ProtocolValidationIssue,
  type ProtocolValidationResult,
  validateNames,
  validateProtocol,
};
