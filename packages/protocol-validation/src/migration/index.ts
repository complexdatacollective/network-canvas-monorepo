// Import the actual protocol types for each version
import type { z } from "zod";
import type { SchemaVersion } from "../schemas";
import type ProtocolSchemaV7 from "../schemas/7/schema";
import type ProtocolSchemaV8 from "../schemas/8/schema";
import { MigrationNotPossibleError, MigrationStepError, VersionMismatchError } from "./errors";

// Map schema versions to their inferred types
type ProtocolTypeMap = {
	7: z.infer<typeof ProtocolSchemaV7>;
	8: z.infer<typeof ProtocolSchemaV8>;
};

export type ProtocolDocument<V extends SchemaVersion> = V extends keyof ProtocolTypeMap
	? ProtocolTypeMap[V]
	: {
			schemaVersion: V;
			[key: string]: unknown;
		};

export type ProtocolMigration<From extends SchemaVersion, To extends SchemaVersion> = {
	from: From;
	to: To;
	notes?: string;
	migrate: (doc: ProtocolDocument<From>) => ProtocolDocument<To>;
};

type AnyMigration = ProtocolMigration<SchemaVersion, SchemaVersion>;

export class MigrationChain {
	private migrations = new Map<SchemaVersion, AnyMigration>();

	register<From extends SchemaVersion, To extends SchemaVersion>(migration: ProtocolMigration<From, To>): this {
		if (this.migrations.has(migration.from)) {
			throw new Error(`Migration from version ${migration.from} already registered`);
		}
		this.migrations.set(migration.from, migration as unknown as AnyMigration);
		return this;
	}

	canMigrate(from: SchemaVersion, to: SchemaVersion): boolean {
		if (from === to) return true;
		if (from > to) return false;

		let current = from;
		while (current < to) {
			const migration = this.migrations.get(current);
			if (!migration) return false;
			current = migration.to;
		}

		return current === to;
	}

	private executeStep<From extends SchemaVersion, To extends SchemaVersion>(
		document: ProtocolDocument<From>,
		migration: ProtocolMigration<From, To>,
	): ProtocolDocument<To> {
		try {
			const result = migration.migrate(document);
			return result;
		} catch (_error) {
			throw new MigrationStepError(migration.from);
		}
	}

	migrate<From extends SchemaVersion, To extends SchemaVersion>(
		document: ProtocolDocument<From>,
		targetVersion: To,
	): ProtocolDocument<To> {
		const fromVersion = document.schemaVersion;

		if ((fromVersion as SchemaVersion) === (targetVersion as SchemaVersion)) {
			return document as unknown as ProtocolDocument<To>;
		}

		if ((fromVersion as number) > (targetVersion as number)) {
			throw new VersionMismatchError(fromVersion, targetVersion);
		}

		let current = document as ProtocolDocument<SchemaVersion>;
		let currentVersion: SchemaVersion = fromVersion;

		while (currentVersion < targetVersion) {
			const migration = this.migrations.get(currentVersion);
			if (!migration) {
				throw new MigrationNotPossibleError(currentVersion, targetVersion);
			}

			current = this.executeStep(
				current as ProtocolDocument<SchemaVersion>,
				migration,
			) as ProtocolDocument<SchemaVersion>;
			currentVersion = migration.to;
		}

		return current as ProtocolDocument<To>;
	}

	getMigrationPath(from: SchemaVersion, to: SchemaVersion): SchemaVersion[] {
		if (from === to) return [from];
		if (from > to) return [];

		const path: SchemaVersion[] = [from];
		let current = from;

		while (current < to) {
			const migration = this.migrations.get(current);
			if (!migration) return [];
			path.push(migration.to);
			current = migration.to;
		}

		return current === to ? path : [];
	}
}

export const protocolMigrations = new MigrationChain();
