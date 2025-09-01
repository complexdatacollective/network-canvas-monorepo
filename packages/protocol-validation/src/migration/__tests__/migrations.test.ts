import { describe, expect, it } from "vitest";
import { VersionedProtocolSchema } from "../../schemas";
import { SchemaVersionDetectionError } from "../errors";
import { MigrationChain, type ProtocolDocument } from "../index";
import { detectSchemaVersion, getMigrationInfo, migrateProtocol, protocolMigrator } from "../migrate-protocol";

describe("Protocol Migrations", () => {
	describe("detectSchemaVersion", () => {
		it("detects version 7", () => {
			const doc = { schemaVersion: 7 };
			expect(detectSchemaVersion(doc)).toBe(7);
		});

		it("detects version 8", () => {
			const doc = { schemaVersion: 8 };
			expect(detectSchemaVersion(doc)).toBe(8);
		});

		it("throws error for unknown versions", () => {
			const doc = { schemaVersion: 6 };
			expect(() => detectSchemaVersion(doc)).toThrow(SchemaVersionDetectionError);
		});

		it("throws error for missing version", () => {
			const doc = {};
			expect(() => detectSchemaVersion(doc)).toThrow(SchemaVersionDetectionError);
		});
	});

	describe("getMigrationInfo", () => {
		it("provides migration path from v7 to v8", () => {
			const info = getMigrationInfo(7, 8);
			expect(info.canMigrate).toBe(true);
			expect(info.path).toEqual([7, 8]);
			expect(info.stepsRequired).toBe(1);
		});

		it("indicates no migration needed for same version", () => {
			const info = getMigrationInfo(8, 8);
			expect(info.canMigrate).toBe(true);
			expect(info.path).toEqual([8]);
			expect(info.stepsRequired).toBe(0);
		});

		it("cannot migrate backwards", () => {
			const info = getMigrationInfo(8, 7);
			expect(info.canMigrate).toBe(false);
			expect(info.path).toEqual([]);
		});
	});

	describe("migrateProtocol", () => {
		const v7Doc = {
			schemaVersion: 7,
			description: "Test protocol v7",
			lastModified: "2024-01-01T00:00:00.000Z",
			codebook: {},
			stages: [],
		};

		const v8Doc = {
			schemaVersion: 8,
			description: "Test protocol v8",
			lastModified: "2024-01-01T00:00:00.000Z",
			codebook: {},
			stages: [],
			experiments: undefined,
		};

		it("migrates from v7 to v8", () => {
			const migrated = migrateProtocol(v7Doc);
			expect(migrated.schemaVersion).toBe(8);
			expect(migrated).toHaveProperty("experiments");
		});

		it("preserves existing data during migration", () => {
			const migrated = migrateProtocol(v7Doc);
			expect(migrated.description).toBe("Test protocol v7");
			expect(migrated.lastModified).toBe("2024-01-01T00:00:00.000Z");
		});

		it("throws error for unknown version", () => {
			const invalidDoc = { schemaVersion: 6 };
			expect(() => migrateProtocol(invalidDoc)).toThrow(SchemaVersionDetectionError);
		});

		it("throws error when trying to downgrade", () => {
			expect(() => migrateProtocol({ ...v8Doc, schemaVersion: 8 }, 7)).toThrow("Nonsensical migration path");
		});
	});

	describe("ProtocolMigrator", () => {
		const v7Doc = {
			schemaVersion: 7,
			description: "Cached test",
			codebook: {},
			stages: [],
		};

		it("caches migration results", async () => {
			const result1 = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test1",
			});
			const result2 = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test1",
			});

			expect(result1).toBe(result2); // Same reference means cached
		});

		it("can clear cache", async () => {
			await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test2",
			});

			protocolMigrator.clearCache("test2");

			const result = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test2",
			});

			expect(result.schemaVersion).toBe(8);
		});

		it("can clear all cache", async () => {
			await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test3",
			});
			await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test4",
			});

			protocolMigrator.clearCache();

			// Both should require new migration
			const result3 = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test3",
			});
			const result4 = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test4",
			});

			expect(result3.schemaVersion).toBe(8);
			expect(result4.schemaVersion).toBe(8);
			expect(result3).not.toBe(result4); // Different instances
		});
	});

	describe("MigrationChain", () => {
		it("throws error when registering duplicate migration", () => {
			const chain = new MigrationChain();
			const migration = {
				from: 7 as const,
				to: 8 as const,
				migrate: (doc: ProtocolDocument<7>) =>
					({ ...doc, schemaVersion: 8 as const }) as unknown as ProtocolDocument<8>,
			};

			chain.register(migration);
			expect(() => chain.register(migration)).toThrow("Migration from version 7 already registered");
		});

		it("returns empty path for invalid migration", () => {
			const chain = new MigrationChain();
			const path = chain.getMigrationPath(7, 8);
			expect(path).toEqual([]);
		});
	});

	describe("VersionedProtocolSchema", () => {
		it("validates v7 schema", () => {
			const v7Doc = {
				schemaVersion: 7,
				description: "Test",
				codebook: {},
				stages: [],
			};
			const result = VersionedProtocolSchema.safeParse(v7Doc);
			expect(result.success).toBe(true);
		});

		it("validates v8 schema", () => {
			const v8Doc = {
				schemaVersion: 8,
				description: "Test",
				codebook: {},
				stages: [],
			};
			const result = VersionedProtocolSchema.safeParse(v8Doc);
			expect(result.success).toBe(true);
		});

		it("rejects invalid schema version", () => {
			const invalidDoc = {
				schemaVersion: 10,
				description: "Test",
				codebook: {},
				stages: [],
			};
			const result = VersionedProtocolSchema.safeParse(invalidDoc);
			expect(result.success).toBe(false);
		});
	});

	describe("Edge cases", () => {
		it("handles missing optional fields during migration", () => {
			const minimalV7Doc = {
				schemaVersion: 7,
				codebook: {},
				stages: [],
			};
			const migrated = migrateProtocol(minimalV7Doc);
			expect(migrated.schemaVersion).toBe(8);
			expect(migrated).toHaveProperty("experiments");
		});

		it("handles validation errors gracefully", () => {
			const invalidDoc = {
				schemaVersion: 7,
				// Missing required fields
			};
			expect(() => migrateProtocol(invalidDoc)).toThrow();
		});
	});
});
