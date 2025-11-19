import { type ExtractedAsset, extractProtocol } from "./utils/extractProtocol";
import { getVariableNamesFromNetwork, validateNames } from "./utils/validateExternalData";
import validateProtocol from "./validation/validate-protocol";

export {
	MigrationChain,
	type ProtocolMigration as Migration,
	protocolMigrations,
} from "./migration";
export * from "./migration/errors";
export {
	detectSchemaVersion,
	getMigrationInfo,
	migrateProtocol,
	ProtocolMigrator,
	protocolMigrator,
} from "./migration/migrate-protocol";

export {
	CURRENT_SCHEMA_VERSION,
	type CurrentProtocol,
	type SchemaVersion,
	SchemaVersionSchema,
	type VersionedProtocol,
	VersionedProtocolSchema,
} from "./schemas";

export { extractProtocol, type ExtractedAsset, getVariableNamesFromNetwork, validateNames, validateProtocol };

// Export schema types and constants (Protocol, Codebook, etc)
export * from "./schemas";
