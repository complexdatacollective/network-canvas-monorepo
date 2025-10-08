import {
	CURRENT_SCHEMA_VERSION,
	type CurrentProtocol,
	CurrentProtocolSchema,
	type SchemaVersion,
	SchemaVersionSchema,
	VersionedProtocolSchema,
} from "../schemas";
import migrationV7toV8 from "../schemas/8/migration";
import { SchemaVersionDetectionError, ValidationError } from "./errors";
import { type ProtocolDocument, protocolMigrations } from "./index";

protocolMigrations.register(migrationV7toV8);

export function detectSchemaVersion(document: unknown): SchemaVersion {
	try {
		const partial = SchemaVersionSchema.safeParse((document as { schemaVersion?: unknown })?.schemaVersion);

		if (partial.success) {
			return partial.data;
		}
		throw new SchemaVersionDetectionError();
	} catch {
		throw new SchemaVersionDetectionError();
	}
}

export function migrateProtocol(
	document: unknown,
	targetVersion: SchemaVersion = CURRENT_SCHEMA_VERSION,
): CurrentProtocol {
	// Detect and validate source schema version
	const detectedVersion = detectSchemaVersion(document);

	// Validate document against its detected schema version
	const preValidationResult = VersionedProtocolSchema.safeParse(document);
	if (!preValidationResult.success) {
		throw new ValidationError(
			`Invalid protocol document for version ${detectedVersion}: ${preValidationResult.error.message}`,
			detectedVersion,
		);
	}

	// Perform migration
	const migrated = protocolMigrations.migrate(document as ProtocolDocument<SchemaVersion>, targetVersion);

	// Validate migrated document against target schema
	const postValidationResult = CurrentProtocolSchema.safeParse(migrated);
	if (!postValidationResult.success) {
		throw new ValidationError(
			`Migration resulted in invalid protocol: ${postValidationResult.error.message}`,
			targetVersion,
		);
	}

	return postValidationResult.data;
}

export function getMigrationInfo(from: SchemaVersion, to: SchemaVersion = CURRENT_SCHEMA_VERSION) {
	const path = protocolMigrations.getMigrationPath(from, to);
	return {
		canMigrate: protocolMigrations.canMigrate(from, to),
		path,
		stepsRequired: path.length - 1,
	};
}

export class ProtocolMigrator {
	private cache = new Map<string, CurrentProtocol>();

	async migrate(
		document: unknown,
		options?: {
			cacheKey?: string;
			targetVersion?: SchemaVersion;
		},
	): Promise<CurrentProtocol> {
		const { cacheKey, targetVersion } = options || {};

		if (cacheKey && this.cache.has(cacheKey)) {
			const cached = this.cache.get(cacheKey);
			if (cached) return cached;
		}

		const migrated = migrateProtocol(document, targetVersion);

		if (cacheKey) {
			this.cache.set(cacheKey, migrated);
		}

		return migrated;
	}

	clearCache(key?: string) {
		if (key) {
			this.cache.delete(key);
		} else {
			this.cache.clear();
		}
	}
}

export const protocolMigrator = new ProtocolMigrator();
