import type { SchemaVersion } from "../schemas";

export class MigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MigrationError";
	}
}

export class MigrationNotPossibleError extends MigrationError {
	constructor(from: SchemaVersion, to: SchemaVersion) {
		super(`Migration to this version is not possible (${from} -> ${to}).`);
		this.name = "MigrationNotPossibleError";
	}
}

export class VersionMismatchError extends MigrationError {
	constructor(from: SchemaVersion, to: SchemaVersion) {
		super(`Nonsensical migration path (${from} -> ${to}). Source version must be lower than target version.`);
		this.name = "VersionMismatchError";
	}
}

export class MigrationStepError extends MigrationError {
	constructor(version: SchemaVersion) {
		super(`Migration step failed at version ${version}.`);
		this.name = "MigrationStepError";
	}
}

export class SchemaVersionDetectionError extends MigrationError {
	constructor() {
		super("Unable to detect schema version from document");
		this.name = "SchemaVersionDetectionError";
	}
}

export class ValidationError extends MigrationError {
	constructor(message: string, version?: SchemaVersion) {
		super(version ? `Validation failed for version ${version}: ${message}` : `Validation failed: ${message}`);
		this.name = "ValidationError";
	}
}
