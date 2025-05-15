import type { Protocol } from "src/schemas/8.zod";
import { MigrationStepError } from "./errors";
import getMigrationPath from "./getMigrationPath";

export type MigrationFunction<SourceProtocol, TargetProtocol> = (protocol: SourceProtocol) => TargetProtocol;

export type ProtocolMigration<SourceProtocol, TargetProtocol> = {
	version: number;
	notes?: string;
	migration: MigrationFunction<SourceProtocol, TargetProtocol>;
};

const migrateStep = <SourceProtocol, TargetProtocol>(
	protocol: SourceProtocol,
	step: ProtocolMigration<SourceProtocol, TargetProtocol>,
) => {
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
