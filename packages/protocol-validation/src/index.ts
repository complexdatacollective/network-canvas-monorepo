import { asEntityAttributeReference } from './schemas/8/entity-attribute-reference';
import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
} from './utils/collectEntityAttributeReferences';
import {
  type ExtractedAsset,
  extractProtocol,
  extractProtocolFromZip,
  MAX_INFLATED_BYTES,
  NetcanvasInflationLimitError,
} from './utils/extractProtocol';
import { hashProtocol } from './utils/hashProtocol';
import {
  getVariableNamesFromNetwork,
  type Network,
  validateNames,
} from './utils/validateExternalData';
import validateProtocol from './validation/validate-protocol';

export {
  MigrationChain,
  type ProtocolMigration as Migration,
  protocolMigrations,
} from './migration';
export * from './migration/errors';
export {
  detectSchemaVersion,
  getMigrationInfo,
  type MigrationInfo,
  type MigrationNote,
  migrateProtocol,
  ProtocolMigrator,
  protocolMigrator,
} from './migration/migrate-protocol';

// Export schema types and constants (Protocol, Codebook, etc)
export * from './schemas';
export {
  asEntityAttributeReference,
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  type ExtractedAsset,
  extractProtocol,
  extractProtocolFromZip,
  getVariableNamesFromNetwork,
  hashProtocol,
  MAX_INFLATED_BYTES,
  type Network,
  NetcanvasInflationLimitError,
  validateNames,
  validateProtocol,
};
