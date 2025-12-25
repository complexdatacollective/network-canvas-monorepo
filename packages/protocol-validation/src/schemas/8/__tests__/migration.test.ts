import { describe, expect, it } from "vitest";
import type { Protocol } from "~/schemas";
import migrationV7toV8 from "../migration";
import ProtocolSchemaV8 from "../schema";

/**
 * Comprehensive tests for V7 to V8 migration
 * Tests all transformations described in the migration notes:
 * - Remove deprecated 'displayVariable' from node and edge definitions
 * - Remove 'options' from Toggle boolean variables
 * - Change filter type from "alter" to "node"
 * - Update schemaVersion to 8 and add experiments field
 */
describe("Migration V7 to V8", () => {
	describe("displayVariable removal", () => {
		it("removes displayVariable from node definitions", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							displayVariable: "name", // This should be removed
							variables: {
								name: {
									name: "Name",
									type: "text",
								},
							},
						},
					},
					edge: {},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			// displayVariable should be removed from node definition
			expect(parsed.codebook.node?.person).not.toHaveProperty("displayVariable");
			// Other properties should remain
			expect(parsed.codebook.node?.person?.name).toBe("Person");
			expect(parsed.codebook.node?.person?.color).toBe("node-color-seq-1");
		});

		it("removes displayVariable from edge definitions", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {},
					edge: {
						knows: {
							name: "Knows",
							color: "edge-color-seq-1",
							displayVariable: "closeness", // This should be removed
							variables: {
								closeness: {
									name: "Closeness",
									type: "ordinal",
									options: [
										{ label: "Not Close", value: 1 },
										{ label: "Very Close", value: 3 },
									],
								},
							},
						},
					},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			// displayVariable should be removed from edge definition
			expect(parsed.codebook.edge?.knows).not.toHaveProperty("displayVariable");
			// Other properties should remain
			expect(parsed.codebook.edge?.knows?.name).toBe("Knows");
			expect(parsed.codebook.edge?.knows?.color).toBe("edge-color-seq-1");
		});

		it("removes displayVariable from multiple node and edge types", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							displayVariable: "name",
						},
						organization: {
							name: "Organization",
							color: "node-color-seq-2",
							displayVariable: "orgName",
						},
					},
					edge: {
						knows: {
							name: "Knows",
							displayVariable: "strength",
						},
						collaborates: {
							name: "Collaborates",
							displayVariable: "frequency",
						},
					},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			// All displayVariable properties should be removed
			expect(parsed.codebook.node?.person).not.toHaveProperty("displayVariable");
			expect(parsed.codebook.node?.organization).not.toHaveProperty("displayVariable");
			expect(parsed.codebook.edge?.knows).not.toHaveProperty("displayVariable");
			expect(parsed.codebook.edge?.collaborates).not.toHaveProperty("displayVariable");
		});
	});

	describe("Toggle variable options removal", () => {
		it("removes options from boolean Toggle variables in node definitions", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							variables: {
								isActive: {
									name: "IsActive",
									type: "boolean",
									component: "Toggle",
									options: [
										// This should be removed
										{ label: "Yes", value: true },
										{ label: "No", value: false },
									],
								},
								hasPets: {
									name: "HasPets",
									type: "boolean",
									component: "Boolean", // Not a Toggle, options should remain
									options: [
										{ label: "Yes", value: true },
										{ label: "No", value: false },
									],
								},
							},
						},
					},
					edge: {},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			const isActive = parsed.codebook.node?.person?.variables?.isActive;
			const hasPets = parsed.codebook.node?.person?.variables?.hasPets;

			// Toggle should not have options
			expect(isActive).not.toHaveProperty("options");
			expect(isActive).toMatchObject({ type: "boolean", component: "Toggle" });

			// Boolean component should keep options
			expect(hasPets).toHaveProperty("options");
			if (hasPets && "options" in hasPets) {
				expect(hasPets.options).toEqual([
					{ label: "Yes", value: true },
					{ label: "No", value: false },
				]);
			}
		});

		it("removes options from boolean Toggle variables in edge definitions", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {},
					edge: {
						knows: {
							name: "Knows",
							variables: {
								isReciprocal: {
									name: "IsReciprocal",
									type: "boolean",
									component: "Toggle",
									options: [
										{ label: "Yes", value: true },
										{ label: "No", value: false },
									],
								},
							},
						},
					},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			expect(parsed.codebook.edge?.knows?.variables?.isReciprocal).not.toHaveProperty("options");
		});

		it("removes options from boolean Toggle variables in ego definitions", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {},
					edge: {},
					ego: {
						variables: {
							employed: {
								name: "Employed",
								type: "boolean",
								component: "Toggle",
								options: [
									{ label: "Yes", value: true },
									{ label: "No", value: false },
								],
							},
							student: {
								name: "Student",
								type: "boolean",
								component: "Toggle",
								options: [
									{ label: "Yes", value: true },
									{ label: "No", value: false },
								],
							},
						},
					},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			expect(parsed.codebook.ego?.variables?.employed).not.toHaveProperty("options");
			expect(parsed.codebook.ego?.variables?.student).not.toHaveProperty("options");
		});

		it("does not remove options from non-Toggle boolean variables", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							variables: {
								hasChildren: {
									name: "HasChildren",
									type: "boolean",
									component: "Boolean",
									options: [
										{ label: "Yes", value: true },
										{ label: "No", value: false },
									],
								},
							},
						},
					},
					edge: {},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			// Boolean (not Toggle) should keep options
			expect(parsed.codebook.node?.person?.variables?.hasChildren).toHaveProperty("options");
		});

		it("does not affect non-boolean variables", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							variables: {
								category: {
									name: "Category",
									type: "categorical",
									options: [
										{ label: "Friend", value: "friend" },
										{ label: "Family", value: "family" },
									],
								},
							},
						},
					},
					edge: {},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			const category = parsed.codebook.node?.person?.variables?.category;
			// Categorical variables should keep options
			expect(category).toHaveProperty("options");
			if (category && "options" in category) {
				expect(category.options).toHaveLength(2);
			}
		});
	});

	describe("filter type transformation", () => {
		it("transforms 'alter' to 'node' in stage panel filter rules", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: { person: { name: "Person", color: "node-color-seq-1" } },
					edge: {},
					ego: {},
				},
				stages: [
					{
						id: "stage1",
						type: "NameGenerator",
						label: "Test Stage",
						form: { fields: [] },
						subject: { entity: "node", type: "person" },
						prompts: [{ id: "prompt1", text: "Test prompt" }],
						panels: [
							{
								id: "panel1",
								dataSource: "existing",
								title: "Panel 1",
								filter: {
									rules: [
										{
											type: "alter", // Should become "node"
											id: "rule1",
											options: {
												operator: "EXISTS",
											},
										},
									],
								},
							},
						],
					},
				],
			};

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			const stage = parsed.stages[0];
			if (stage && "panels" in stage) {
				expect(stage.panels?.[0]?.filter?.rules?.[0]?.type).toBe("node");
			}
		});

		it("transforms 'alter' to 'node' in stage skipLogic filter rules", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: { person: { name: "Person", color: "node-color-seq-1" } },
					edge: {},
					ego: {},
				},
				stages: [
					{
						id: "stage1",
						type: "NameGenerator",
						label: "Test Stage",
						form: { fields: [] },
						subject: { entity: "node", type: "person" },
						prompts: [{ id: "prompt1", text: "Test prompt" }],
						skipLogic: {
							action: "SKIP",
							filter: {
								rules: [
									{
										type: "alter", // Should become "node"
										id: "rule1",
										options: {
											operator: "EXISTS",
										},
									},
								],
							},
						},
					},
				],
			};

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			const stage = parsed.stages[0];
			if (stage && "skipLogic" in stage) {
				expect(stage.skipLogic?.filter?.rules?.[0]?.type).toBe("node");
			}
		});

		it("transforms 'alter' to 'node' in stage filter rules", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: { person: { name: "Person", color: "node-color-seq-1" } },
					edge: {},
					ego: {},
				},
				stages: [
					{
						id: "stage1",
						type: "NameGenerator",
						label: "Test Stage",
						form: { fields: [] },
						subject: { entity: "node", type: "person" },
						prompts: [{ id: "prompt1", text: "Test prompt" }],
						filter: {
							rules: [
								{
									type: "alter", // Should become "node"
									id: "rule1",
									options: {
										operator: "EXISTS",
									},
								},
							],
						},
					},
				],
			};

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			const stage = parsed.stages[0];
			if (stage && "filter" in stage) {
				expect(stage.filter?.rules?.[0]?.type).toBe("node");
			}
		});

		it("transforms multiple 'alter' filter rules in various locations", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: { person: { name: "Person", color: "node-color-seq-1" } },
					edge: {},
					ego: {},
				},
				stages: [
					{
						id: "stage1",
						type: "NameGenerator",
						label: "Test Stage",
						form: { fields: [] },
						subject: { entity: "node", type: "person" },
						prompts: [{ id: "prompt1", text: "Test prompt" }],
						filter: {
							rules: [
								{ type: "alter", id: "rule1", options: { operator: "EXISTS" } },
								{
									type: "alter",
									id: "rule2",
									options: { operator: "NOT_EXISTS" },
								},
							],
						},
						skipLogic: {
							action: "SKIP",
							filter: {
								rules: [
									{
										type: "alter",
										id: "rule3",
										options: { operator: "EXISTS" },
									},
								],
							},
						},
						panels: [
							{
								id: "panel1",
								dataSource: "existing",
								title: "Panel 1",
								filter: {
									rules: [
										{
											type: "alter",
											id: "rule4",
											options: { operator: "EXISTS" },
										},
									],
								},
							},
						],
					},
				],
			};

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			const stage = parsed.stages[0];
			if (stage && "filter" in stage && "skipLogic" in stage && "panels" in stage) {
				expect(stage.filter?.rules?.[0]?.type).toBe("node");
				expect(stage.filter?.rules?.[1]?.type).toBe("node");
				expect(stage.skipLogic?.filter?.rules?.[0]?.type).toBe("node");
				const panels = stage.panels as Array<{ filter?: { rules?: Array<{ type?: string }> } }> | undefined;
				expect(panels?.[0]?.filter?.rules?.[0]?.type).toBe("node");
			}
		});

		it("preserves 'ego' and 'edge' filter types", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: { person: { name: "Person", color: "node-color-seq-1" } },
					edge: {},
					ego: {},
				},
				stages: [
					{
						id: "stage1",
						type: "NameGenerator",
						label: "Test Stage",
						form: { fields: [] },
						subject: { entity: "node", type: "person" },
						prompts: [{ id: "prompt1", text: "Test prompt" }],
						filter: {
							rules: [
								{ type: "ego", id: "rule1", options: { operator: "EXISTS" } },
								{ type: "edge", id: "rule2", options: { operator: "EXISTS" } },
								{ type: "alter", id: "rule3", options: { operator: "EXISTS" } },
							],
						},
					},
				],
			};

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });
			const parsed = ProtocolSchemaV8.parse(migratedRaw);

			const stage = parsed.stages[0];
			if (stage && "filter" in stage) {
				expect(stage.filter?.rules?.[0]?.type).toBe("ego");
				expect(stage.filter?.rules?.[1]?.type).toBe("edge");
				expect(stage.filter?.rules?.[2]?.type).toBe("node");
			}
		});
	});

	describe("schema version and experiments field update", () => {
		it("updates schemaVersion from 7 to 8", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: { node: {}, edge: {}, ego: {} },
				stages: [],
			} as Protocol<7>;

			const migrated = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });

			expect(migrated.schemaVersion).toBe(8);
		});

		it("adds experiments field", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: { node: {}, edge: {}, ego: {} },
				stages: [],
			} as Protocol<7>;

			const migrated = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });

			expect(migrated).toHaveProperty("experiments");
			expect(migrated.experiments).toEqual({});
		});

		it("preserves other top-level fields while adding experiments", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				description: "Test protocol",
				lastModified: "2025-01-01T00:00:00.000Z",
				codebook: { node: {}, edge: {}, ego: {} },
				stages: [],
			} as Protocol<7>;

			const migrated = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });

			expect(migrated.schemaVersion).toBe(8);
			expect(migrated.description).toBe("Test protocol");
			expect(migrated.lastModified).toBe("2025-01-01T00:00:00.000Z");
			expect(migrated.experiments).toEqual({});
		});
	});

	describe("comprehensive migration validation", () => {
		it("successfully migrates a complex protocol with all transformations and validates against V8 schema", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				description: "Complex test protocol",
				lastModified: "2025-01-01T00:00:00.000Z",
				codebook: {
					ego: {
						variables: {
							employed: {
								name: "Employed",
								type: "boolean",
								component: "Toggle",
								options: [
									// Should be removed
									{ label: "Yes", value: true },
									{ label: "No", value: false },
								],
							},
							age: {
								name: "Age",
								type: "number",
							},
						},
					},
					node: {
						person: {
							name: "Person",
							color: "node-color-seq-1",
							displayVariable: "name", // Should be removed
							variables: {
								name: {
									name: "Name",
									type: "text",
								},
								isActive: {
									name: "IsActive",
									type: "boolean",
									component: "Toggle",
									options: [
										// Should be removed
										{ label: "Yes", value: true },
										{ label: "No", value: false },
									],
								},
								category: {
									name: "Category",
									type: "categorical",
									options: [
										// Should NOT be removed (not a Toggle)
										{ label: "Friend", value: "friend" },
										{ label: "Family", value: "family" },
									],
								},
							},
						},
					},
					edge: {
						knows: {
							name: "Knows",
							color: "edge-color-seq-1",
							displayVariable: "closeness", // Should be removed
							variables: {
								closeness: {
									name: "Closeness",
									type: "ordinal",
									options: [
										{ label: "Not Close", value: 1 },
										{ label: "Very Close", value: 3 },
									],
								},
								confirmed: {
									name: "Confirmed",
									type: "boolean",
									component: "Toggle",
									options: [
										// Should be removed
										{ label: "Yes", value: true },
										{ label: "No", value: false },
									],
								},
							},
						},
					},
				},
				stages: [
					{
						id: "nameGenerator1",
						type: "NameGenerator",
						label: "Generate Names",
						subject: {
							entity: "node",
							type: "person",
						},
						form: {
							fields: [
								{
									variable: "name",
									prompt: "Enter name",
								},
							],
						},
						prompts: [
							{
								id: "prompt1",
								text: "Who do you know?",
							},
						],
						filter: {
							rules: [
								{
									type: "alter", // Should become "node"
									id: "rule1",
									options: {
										type: "person",
										attribute: "category",
										operator: "EXACTLY",
										value: "friend",
									},
								},
							],
						},
						skipLogic: {
							action: "SKIP",
							filter: {
								rules: [
									{
										type: "alter", // Should become "node"
										id: "rule2",
										options: {
											operator: "EXISTS",
										},
									},
								],
							},
						},
						panels: [
							{
								id: "panel1",

								dataSource: "existing",

								title: "Panel 1",
								filter: {
									rules: [
										{
											type: "alter", // Should become "node"
											id: "rule3",
											options: {
												operator: "EXISTS",
											},
										},
									],
								},
							},
						],
					},
				],
			} as Protocol<7>;

			const migratedRaw = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });

			// Validate against V8 schema
			const result = ProtocolSchemaV8.safeParse(migratedRaw);

			if (!result.success) {
			}

			expect(result.success).toBe(true);
		});

		it("handles empty protocol correctly", () => {
			const v7Protocol = {
				schemaVersion: 7 as const,
				codebook: {
					node: {},
					edge: {},
					ego: {},
				},
				stages: [],
			} as Protocol<7>;

			const migrated = migrationV7toV8.migrate(v7Protocol, { name: "Test Protocol" });

			expect(migrated.schemaVersion).toBe(8);
			expect(migrated.experiments).toEqual({});

			// Validate against V8 schema
			const result = ProtocolSchemaV8.safeParse(migrated);
			expect(result.success).toBe(true);
		});
	});

	describe("migration metadata", () => {
		it("has correct from and to versions", () => {
			expect(migrationV7toV8.from).toBe(7);
			expect(migrationV7toV8.to).toBe(8);
		});

		it("has migration notes", () => {
			expect(migrationV7toV8.notes).toBeDefined();
			expect(typeof migrationV7toV8.notes).toBe("string");
			if (migrationV7toV8.notes) {
				expect(migrationV7toV8.notes.length).toBeGreaterThan(0);
			}
		});
	});
});
