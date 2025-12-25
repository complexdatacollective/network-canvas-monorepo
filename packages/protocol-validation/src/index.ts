import { type ExtractedAsset, extractProtocol } from "./utils/extractProtocol";
import { getVariableNamesFromNetwork, type Network, validateNames } from "./utils/validateExternalData";
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
	type MigrationInfo,
	type MigrationNote,
	migrateProtocol,
	ProtocolMigrator,
	protocolMigrator,
} from "./migration/migrate-protocol";

// Export schema types and constants (Protocol, Codebook, etc)
export * from "./schemas";

export { extractProtocol, type ExtractedAsset };

export { getVariableNamesFromNetwork, validateNames, type Network };

export { validateProtocol };
