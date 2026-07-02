import { asEntityAttributeReference } from './schemas/8/entity-attribute-reference';
import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
} from './utils/collectEntityAttributeReferences';
import { type ExtractedAsset, extractProtocol } from './utils/extractProtocol';
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
  getVariableNamesFromNetwork,
  hashProtocol,
  type Network,
  validateNames,
  validateProtocol,
};
