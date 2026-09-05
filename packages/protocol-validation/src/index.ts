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

export { parseAcceptLanguage } from './localization/parseAcceptLanguage.ts';
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
// Interface-owned value sets that are part of the current schema's contract.
// They live in the schema version directory and are copied — never shared —
// when a new version directory is created, so a host always reads the set the
// version it targets defines.
export {
  BIOLOGICAL_SEX_OPTIONS,
  BIOLOGICAL_SEX_VALUES,
  type BiologicalSex,
  FRAMING_IDS,
  type FramingId,
  GAMETE_ROLE_OPTIONS,
  GAMETE_ROLES,
  type GameteRole,
  RELATIONSHIP_TYPE_OPTIONS,
  RELATIONSHIP_TYPES,
  type RelationshipType,
} from './schemas/8/family-pedigree-values.ts';
export {
  INHERITANCE_PATTERNS,
  type InheritancePattern,
} from './schemas/8/narrative-pedigree-values.ts';
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
// protocol schema's own refinement, and a host that wants to know whether a
// protocol is admissible should call `validateProtocol`.
export {
  type ExclusiveVariableSlot,
  findExclusiveVariableSlots,
  findInterfaceOwnedOptionBindings,
  type InterfaceOwnedOptionBinding,
} from './utils/findExclusiveVariableConflicts.ts';
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
