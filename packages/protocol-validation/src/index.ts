import { extractProtocol } from "./utils/extractProtocol";
import { getVariableNamesFromNetwork, validateNames } from "./utils/validateExternalData";
import { errToString } from "./validation/helpers";
import validateProtocol from "./validation/validate-protocol";
export {
	detectSchemaVersion,
	getMigrationInfo,
	migrateProtocol,
	protocolMigrator,
	ProtocolMigrator,
} from "./migration/migrate-protocol";

export {
	MigrationChain,
	protocolMigrations,
	type ProtocolMigration as Migration,
} from "./migration";

export * from "./migration/errors";

export {
	CURRENT_SCHEMA_VERSION,
	SchemaVersionSchema,
	VersionedProtocolSchema,
	type CurrentProtocol,
	type SchemaVersion,
	type VersionedProtocol,
} from "./schemas";

export { errToString, extractProtocol, getVariableNamesFromNetwork, validateNames, validateProtocol };

// Export schema types and constants (Protocol, Codebook, etc)
export * from "./schemas";
