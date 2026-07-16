import { asEntityAttributeReference } from './schemas/8/entity-attribute-reference.ts';
import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
} from './utils/collectEntityAttributeReferences.ts';
import {
  type ExtractedAsset,
  extractProtocol,
  extractProtocolFromZip,
  MAX_INFLATED_BYTES,
  NetcanvasInflationLimitError,
} from './utils/extractProtocol.ts';
import { hashProtocol } from './utils/hashProtocol.ts';
import {
  getVariableNamesFromNetwork,
  type Network,
  validateNames,
} from './utils/validateExternalData.ts';
import validateProtocol from './validation/validate-protocol.ts';

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
