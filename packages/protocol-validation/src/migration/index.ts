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

export type ProtocolMigration<
	From extends SchemaVersion,
	To extends SchemaVersion,
	Deps extends Record<string, unknown> = Record<string, never>,
> = {
	from: From;
	to: To;
	notes?: string;
	dependencies: (keyof Deps)[];
	migrate: (doc: ProtocolDocument<From>, deps: Deps) => ProtocolDocument<To>;
};

type AnyMigration = ProtocolMigration<SchemaVersion, SchemaVersion, Record<string, unknown>>;

export class MigrationChain {
	private migrations = new Map<SchemaVersion, AnyMigration>();

	register<From extends SchemaVersion, To extends SchemaVersion, Deps extends Record<string, unknown>>(
		migration: ProtocolMigration<From, To, Deps>,
	): this {
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

	/**
	 * Get all dependency keys required for a migration path.
	 */
	getDependencies(from: SchemaVersion, to: SchemaVersion): string[] {
		if (from >= to) return [];

		const allDeps = new Set<string>();
		let current = from;

		while (current < to) {
			const migration = this.migrations.get(current);
			if (!migration) break;
			for (const dep of migration.dependencies) {
				allDeps.add(dep as string);
			}
			current = migration.to;
		}

		return [...allDeps];
	}

	private executeStep<From extends SchemaVersion, To extends SchemaVersion>(
		document: ProtocolDocument<From>,
		migration: ProtocolMigration<From, To, Record<string, unknown>>,
		dependencies: Record<string, unknown>,
	): ProtocolDocument<To> {
		try {
			const result = migration.migrate(document, dependencies);
			return result;
		} catch (_error) {
			throw new MigrationStepError(migration.from);
		}
	}

	migrate<From extends SchemaVersion, To extends SchemaVersion>(
		document: ProtocolDocument<From>,
		targetVersion: To,
		dependencies: Record<string, unknown> = {},
	): ProtocolDocument<To> {
		const fromVersion = document.schemaVersion;

		if ((fromVersion as SchemaVersion) === (targetVersion as SchemaVersion)) {
			return document as unknown as ProtocolDocument<To>;
		}

		if ((fromVersion as number) > (targetVersion as number)) {
			throw new VersionMismatchError(fromVersion, targetVersion);
		}

		// Validate that all required dependencies are provided
		const requiredDeps = this.getDependencies(fromVersion, targetVersion);
		const missingDeps = requiredDeps.filter((dep) => dependencies[dep] === undefined);
		if (missingDeps.length > 0) {
			throw new Error(`Missing required migration dependencies: ${missingDeps.join(", ")}`);
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
				dependencies,
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

	getMigrationNotes(from: SchemaVersion, to: SchemaVersion): { version: SchemaVersion; notes: string }[] {
		if (from >= to) return [];

		const notes: { version: SchemaVersion; notes: string }[] = [];
		let current = from;

		while (current < to) {
			const migration = this.migrations.get(current);
			if (!migration) break;
			if (migration.notes) {
				notes.push({ version: migration.to, notes: migration.notes });
			}
			current = migration.to;
		}

		return notes;
	}
}

export const protocolMigrations = new MigrationChain();
