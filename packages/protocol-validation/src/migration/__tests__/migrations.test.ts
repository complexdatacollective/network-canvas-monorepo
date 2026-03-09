import { describe, expect, it } from "vitest";
import { VersionedProtocolSchema } from "~/schemas";
import migrationV1toV2 from "~/schemas/2/migration";
import migrationV2toV3 from "~/schemas/3/migration";
import migrationV4toV5 from "~/schemas/5/migration";
import migrationV6toV7 from "~/schemas/7/migration";
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

		it("detects versions 1 through 6", () => {
			for (const v of [1, 2, 3, 4, 5, 6]) {
				const doc = { schemaVersion: v };
				expect(detectSchemaVersion(doc)).toBe(v);
			}
		});

		it("coerces string schemaVersion for v1", () => {
			const doc = { schemaVersion: "1" };
			expect(detectSchemaVersion(doc)).toBe(1);
		});

		it("throws error for unknown versions", () => {
			const doc = { schemaVersion: 0 };
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
			name: "Test Protocol V8",
			schemaVersion: 8,
			description: "Test protocol v8",
			lastModified: "2024-01-01T00:00:00.000Z",
			codebook: {},
			stages: [],
			experiments: undefined,
		};

		it("migrates from v7 to v8", () => {
			const migrated = migrateProtocol(v7Doc, undefined, { name: "Test Protocol" });
			expect(migrated.schemaVersion).toBe(8);
			expect(migrated).toHaveProperty("experiments");
		});

		it("preserves existing data during migration", () => {
			const migrated = migrateProtocol(v7Doc, undefined, { name: "Test Protocol" });
			expect(migrated.description).toBe("Test protocol v7");
			expect(migrated.lastModified).toBe("2024-01-01T00:00:00.000Z");
		});

		it("throws error for unknown version", () => {
			const invalidDoc = { schemaVersion: 0 };
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
				dependencies: { name: "Test Protocol" },
			});
			const result2 = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test1",
				dependencies: { name: "Test Protocol" },
			});

			expect(result1).toBe(result2); // Same reference means cached
		});

		it("can clear cache", async () => {
			await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test2",
				dependencies: { name: "Test Protocol" },
			});

			protocolMigrator.clearCache("test2");

			const result = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test2",
				dependencies: { name: "Test Protocol" },
			});

			expect(result.schemaVersion).toBe(8);
		});

		it("can clear all cache", async () => {
			await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test3",
				dependencies: { name: "Test Protocol" },
			});
			await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test4",
				dependencies: { name: "Test Protocol" },
			});

			protocolMigrator.clearCache();

			// Both should require new migration
			const result3 = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test3",
				dependencies: { name: "Test Protocol" },
			});
			const result4 = await protocolMigrator.migrate(v7Doc, {
				cacheKey: "test4",
				dependencies: { name: "Test Protocol" },
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
				dependencies: {},
				migrate: (doc: ProtocolDocument<7>) =>
					({
						...doc,
						schemaVersion: 8 as const,
					}) as unknown as ProtocolDocument<8>,
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
				name: "Test Protocol",
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
			const migrated = migrateProtocol(minimalV7Doc, undefined, { name: "Test Protocol" });
			expect(migrated.schemaVersion).toBe(8);
			expect(migrated).toHaveProperty("experiments");
		});

		it("handles validation errors gracefully", () => {
			const invalidDoc = {
				schemaVersion: 7,
				// Missing required fields
			};
			expect(() => migrateProtocol(invalidDoc, undefined, { name: "Test Protocol" })).toThrow();
		});

		it("throws error when missing required dependencies", () => {
			const v7Doc = {
				schemaVersion: 7,
				codebook: {},
				stages: [],
			};
			expect(() => migrateProtocol(v7Doc)).toThrow("Missing required migration dependencies: name");
		});
	});

	describe("full migration chain", () => {
		it("migrates a v1 protocol to v8", () => {
			const v1Protocol = {
				schemaVersion: 1,
				codebook: {
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							variables: {
								name: { name: "name", type: "text" },
							},
						},
					},
					edge: {},
					ego: {},
				},
				stages: [],
			};

			const migrated = migrateProtocol(v1Protocol, undefined, { name: "Test Protocol" });
			expect(migrated.schemaVersion).toBe(8);
			expect(migrated).toHaveProperty("experiments");
			expect(migrated.name).toBe("Test Protocol");
		});

		it("migrates a v3 protocol with dirty names to v8", () => {
			const v3Protocol = {
				schemaVersion: 3,
				codebook: {
					node: {
						person: {
							name: "My Type",
							color: "node-color-seq-1",
							variables: {
								var1: { name: "first name", type: "text" },
							},
						},
					},
					edge: {},
					ego: {},
				},
				stages: [],
			};

			const migrated = migrateProtocol(v3Protocol, undefined, { name: "Test Protocol" });
			expect(migrated.schemaVersion).toBe(8);
		});

		it("migrates a v5 protocol with old NameGenerator types to v8", () => {
			const v5Protocol = {
				schemaVersion: 5,
				codebook: {
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							variables: {
								name: { name: "name", type: "text" },
							},
						},
					},
					edge: {},
					ego: {},
				},
				stages: [
					{
						id: "stage1",
						type: "NameGeneratorAutoComplete",
						label: "Test",
						subject: { entity: "node", type: "person" },
						prompts: [{ id: "p1", text: "Test" }],
						panels: [],
						dataSource: "existing",
					},
				],
			};

			const migrated = migrateProtocol(v5Protocol, undefined, { name: "Test Protocol" });
			expect(migrated.schemaVersion).toBe(8);
			// NameGeneratorAutoComplete should have been converted to NameGeneratorRoster by v5→v6
			const stage = migrated.stages[0];
			expect(stage).toBeDefined();
			if (stage) {
				expect(stage.type).toBe("NameGeneratorRoster");
			}
		});

		it("reports correct migration path from v1 to v8", () => {
			const info = getMigrationInfo(1, 8);
			expect(info.canMigrate).toBe(true);
			expect(info.path).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
			expect(info.stepsRequired).toBe(7);
		});

		it("reports migration notes for all steps that have them", () => {
			const info = getMigrationInfo(1, 8);
			expect(info.notes.length).toBeGreaterThan(0);
			const versionsWithNotes = info.notes.map((n) => n.version);
			expect(versionsWithNotes).toContain(4);
			expect(versionsWithNotes).toContain(6);
			expect(versionsWithNotes).toContain(8);
		});

		it("migrates a v1 protocol with string schemaVersion to v8", () => {
			const v1Protocol = {
				schemaVersion: "1",
				codebook: {
					node: {},
					edge: {},
					ego: {},
				},
				stages: [],
			};

			const migrated = migrateProtocol(v1Protocol, undefined, { name: "Test Protocol" });
			expect(migrated.schemaVersion).toBe(8);
		});
	});

	describe("no-op migrations", () => {
		it("v1→v2: bumps version", () => {
			const result = migrationV1toV2.migrate({ schemaVersion: 1 as const } as ProtocolDocument<1>, {});
			expect(result.schemaVersion).toBe(2);
		});

		it("v2→v3: bumps version", () => {
			const result = migrationV2toV3.migrate({ schemaVersion: 2 as const } as ProtocolDocument<2>, {});
			expect(result.schemaVersion).toBe(3);
		});

		it("v4→v5: bumps version", () => {
			const result = migrationV4toV5.migrate({ schemaVersion: 4 as const } as ProtocolDocument<4>, {});
			expect(result.schemaVersion).toBe(5);
		});

		it("v6→v7: bumps version", () => {
			const result = migrationV6toV7.migrate({ schemaVersion: 6 as const } as ProtocolDocument<6>, {});
			expect(result.schemaVersion).toBe(7);
		});

		it("v4→v5: has migration notes", () => {
			expect(migrationV4toV5.notes).toBeDefined();
			expect(migrationV4toV5.notes?.length).toBeGreaterThan(0);
		});

		it("v6→v7: has migration notes", () => {
			expect(migrationV6toV7.notes).toBeDefined();
			expect(migrationV6toV7.notes?.length).toBeGreaterThan(0);
		});
	});
});
