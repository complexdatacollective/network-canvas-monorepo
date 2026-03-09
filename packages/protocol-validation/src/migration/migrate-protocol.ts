import {
	CURRENT_SCHEMA_VERSION,
	type CurrentProtocol,
	CurrentProtocolSchema,
	type SchemaVersion,
	SchemaVersionSchema,
	VersionedProtocolSchema,
} from "../schemas";
import migrationV1toV2 from "../schemas/2/migration";
import migrationV2toV3 from "../schemas/3/migration";
import migrationV3toV4 from "../schemas/4/migration";
import migrationV4toV5 from "../schemas/5/migration";
import migrationV5toV6 from "../schemas/6/migration";
import migrationV6toV7 from "../schemas/7/migration";
import migrationV7toV8 from "../schemas/8/migration";
import { SchemaVersionDetectionError, ValidationError } from "./errors";
import { type ProtocolDocument, protocolMigrations } from "./index";

protocolMigrations.register(migrationV1toV2);
protocolMigrations.register(migrationV2toV3);
protocolMigrations.register(migrationV3toV4);
protocolMigrations.register(migrationV4toV5);
protocolMigrations.register(migrationV5toV6);
protocolMigrations.register(migrationV6toV7);
protocolMigrations.register(migrationV7toV8);

export function detectSchemaVersion(document: unknown): SchemaVersion {
	try {
		const rawVersion = (document as { schemaVersion?: unknown })?.schemaVersion;

		// Handle v1 string schemaVersion ("1" -> 1)
		const coerced = typeof rawVersion === "string" ? Number(rawVersion) : rawVersion;

		const partial = SchemaVersionSchema.safeParse(coerced);

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
	dependencies: Record<string, unknown> = {},
): CurrentProtocol {
	const detectedVersion = detectSchemaVersion(document);

	// Only pre-validate versions that have Zod schemas (7+)
	if (detectedVersion >= 7) {
		const preValidationResult = VersionedProtocolSchema.safeParse(document);
		if (!preValidationResult.success) {
			throw new ValidationError(
				`Invalid protocol document for version ${detectedVersion}: ${preValidationResult.error.message}`,
				detectedVersion,
			);
		}
	}

	// Ensure schemaVersion is numeric before passing to migration chain
	const normalizedDocument = { ...(document as Record<string, unknown>), schemaVersion: detectedVersion };

	// Perform migration
	const migrated = protocolMigrations.migrate(
		normalizedDocument as ProtocolDocument<SchemaVersion>,
		targetVersion,
		dependencies,
	);

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
		notes: protocolMigrations.getMigrationNotes(from, to),
		dependencies: protocolMigrations.getDependencies(from, to),
	};
}

export type MigrationInfo = ReturnType<typeof getMigrationInfo>;
export type MigrationNote = MigrationInfo["notes"][number];

export class ProtocolMigrator {
	private cache = new Map<string, CurrentProtocol>();

	async migrate(
		document: unknown,
		options?: {
			cacheKey?: string;
			targetVersion?: SchemaVersion;
			dependencies?: Record<string, unknown>;
		},
	): Promise<CurrentProtocol> {
		const { cacheKey, targetVersion, dependencies } = options || {};

		if (cacheKey && this.cache.has(cacheKey)) {
			const cached = this.cache.get(cacheKey);
			if (cached) return cached;
		}

		const migrated = migrateProtocol(document, targetVersion, dependencies);

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
