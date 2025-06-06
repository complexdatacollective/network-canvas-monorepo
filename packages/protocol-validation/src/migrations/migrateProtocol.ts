import type { Protocol } from "src/schemas/8.zod";
import { MigrationStepError } from "./errors";
import getMigrationPath from "./getMigrationPath";

export type ProtocolMigration = {
	version: number;
	notes?: string;
	migration: (protocol: Protocol) => Protocol;
};

const migrateStep = (protocol: Protocol, step: ProtocolMigration) => {
	const { version, migration } = step;
	try {
		return migration(protocol);
	} catch (e) {
		if (e instanceof Error) {
			throw new MigrationStepError(version);
		}

		throw e;
	}
};

export const migrateProtocol = (protocol: Protocol, targetSchemaVersion: number) => {
	// Get migration steps between versions
	const migrationPath = getMigrationPath(protocol.schemaVersion, targetSchemaVersion);

	// Perform migration
	const updatedProtocol = migrationPath.reduce(migrateStep, protocol);

	const resultProtocol = {
		...updatedProtocol,
		schemaVersion: targetSchemaVersion,
	};

	return resultProtocol;
};
