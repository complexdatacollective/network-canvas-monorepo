import { describe, expect, it } from "vitest";
import migrationV3toV4 from "../migration";

describe("Migration V3 to V4", () => {
	const makeProtocol = (overrides: Record<string, unknown> = {}) => ({
		schemaVersion: 3 as const,
		codebook: {
			node: {},
			edge: {},
			ego: { name: "ego" },
		},
		stages: [],
		...overrides,
	});

	function getNestedValue(obj: unknown, ...keys: string[]): unknown {
		let current = obj;
		for (const key of keys) {
			if (current === null || current === undefined || typeof current !== "object") {
				return undefined;
			}
			current = (current as Record<string, unknown>)[key];
		}
		return current;
	}

	describe("variable name sanitization", () => {
		it("replaces spaces with underscores in variable names", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								v1: { name: "first name" },
							},
						},
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			expect(getNestedValue(migrated.codebook, "node", "person", "variables", "v1", "name")).toBe("first_name");
		});

		it("removes special characters from variable names", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								v1: { name: "var!@#$name" },
							},
						},
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			expect(getNestedValue(migrated.codebook, "node", "person", "variables", "v1", "name")).toBe("varname");
		});

		it("preserves allowed characters (letters, numbers, . _ - :)", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								v1: { name: "valid.name_with-special:chars123" },
							},
						},
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			expect(getNestedValue(migrated.codebook, "node", "person", "variables", "v1", "name")).toBe(
				"valid.name_with-special:chars123",
			);
		});
	});

	describe("variable name deduplication", () => {
		it("adds numerical suffix when sanitized names collide", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								v1: { name: "my var" },
								v2: { name: "my!var" },
								v3: { name: "my@var" },
							},
						},
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const names = [
				getNestedValue(migrated.codebook, "node", "person", "variables", "v1", "name"),
				getNestedValue(migrated.codebook, "node", "person", "variables", "v2", "name"),
				getNestedValue(migrated.codebook, "node", "person", "variables", "v3", "name"),
			];

			expect(names).toContain("my_var");
			expect(names).toContain("myvar");
			expect(names).toContain("myvar2");
		});
	});

	describe("option value sanitization", () => {
		it("sanitizes ordinal/categorical option values", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								v1: {
									name: "category",
									options: [
										{ label: "Option A", value: "hello world" },
										{ label: "Option B", value: "foo!bar" },
									],
								},
							},
						},
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const options = getNestedValue(migrated.codebook, "node", "person", "variables", "v1", "options") as Array<{
				value: string;
			}>;
			expect(options.at(0)?.value).toBe("hello_world");
			expect(options.at(1)?.value).toBe("foobar");
		});

		it("deduplicates option values with numerical suffixes", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								v1: {
									name: "category",
									options: [
										{ label: "A", value: "a b" },
										{ label: "B", value: "a!b" },
									],
								},
							},
						},
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const options = getNestedValue(migrated.codebook, "node", "person", "variables", "v1", "options") as Array<{
				value: string;
			}>;
			const values = options.map((o) => o.value);
			expect(values).toContain("a_b");
			expect(values).toContain("ab");
		});
	});

	describe("type name sanitization", () => {
		it("sanitizes node type names", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						t1: { name: "My Type!" },
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			expect(getNestedValue(migrated.codebook, "node", "t1", "name")).toBe("My_Type");
		});

		it("sanitizes edge type names", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {},
					edge: {
						e1: { name: "knows well" },
					},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			expect(getNestedValue(migrated.codebook, "edge", "e1", "name")).toBe("knows_well");
		});
	});

	describe("type name deduplication", () => {
		it("adds numerical suffix when sanitized type names collide", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						t1: { name: "my type" },
						t2: { name: "my!type" },
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const names = [
				getNestedValue(migrated.codebook, "node", "t1", "name"),
				getNestedValue(migrated.codebook, "node", "t2", "name"),
			];
			expect(names).toContain("my_type");
			expect(names).toContain("mytype");
		});
	});

	describe("additionalAttributes filtering", () => {
		it("removes non-boolean additionalAttributes from prompts", () => {
			const protocol = makeProtocol({
				stages: [
					{
						prompts: [
							{
								id: "p1",
								text: "test",
								additionalAttributes: [
									{ variable: "v1", value: true },
									{ variable: "v2", value: "some string" },
									{ variable: "v3", value: false },
									{ variable: "v4", value: 42 },
								],
							},
						],
					},
				],
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const attrs = getNestedValue(migrated.stages, "0", "prompts", "0", "additionalAttributes") as Array<{
				variable: string;
				value: unknown;
			}>;
			expect(attrs).toHaveLength(2);
			expect(attrs.at(0)?.value).toBe(true);
			expect(attrs.at(1)?.value).toBe(false);
		});

		it("removes additionalAttributes entirely if no boolean entries remain", () => {
			const protocol = makeProtocol({
				stages: [
					{
						prompts: [
							{
								id: "p1",
								text: "test",
								additionalAttributes: [
									{ variable: "v1", value: "string" },
									{ variable: "v2", value: 42 },
								],
							},
						],
					},
				],
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const prompt = (migrated.stages as Array<{ prompts: Array<Record<string, unknown>> }>).at(0)?.prompts.at(0);
			expect(prompt).not.toHaveProperty("additionalAttributes");
		});

		it("does not modify prompts without additionalAttributes", () => {
			const protocol = makeProtocol({
				stages: [
					{
						prompts: [{ id: "p1", text: "test" }],
					},
				],
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const prompt = (migrated.stages as Array<{ prompts: Array<Record<string, unknown>> }>).at(0)?.prompts.at(0);
			expect(prompt).not.toHaveProperty("additionalAttributes");
			expect(prompt?.id).toBe("p1");
		});

		it("does not modify stages without prompts", () => {
			const protocol = makeProtocol({
				stages: [{ id: "s1", type: "Information" }],
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const stage = (migrated.stages as Array<Record<string, unknown>>).at(0);
			expect(stage?.id).toBe("s1");
		});
	});

	describe("schema version bump", () => {
		it("sets schemaVersion to 4", () => {
			const protocol = makeProtocol();
			const migrated = migrationV3toV4.migrate(protocol, {});
			expect(migrated.schemaVersion).toBe(4);
		});
	});

	describe("migration metadata", () => {
		it("has correct from and to versions", () => {
			expect(migrationV3toV4.from).toBe(3);
			expect(migrationV3toV4.to).toBe(4);
		});

		it("has migration notes", () => {
			expect(migrationV3toV4.notes).toBeDefined();
			expect(typeof migrationV3toV4.notes).toBe("string");
			if (migrationV3toV4.notes) {
				expect(migrationV3toV4.notes.length).toBeGreaterThan(0);
			}
		});
	});

	describe("preserves existing data", () => {
		it("does not modify properties outside codebook and stages", () => {
			const protocol = makeProtocol({
				description: "My protocol",
				lastModified: "2025-01-01",
				customField: { nested: true },
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const result = migrated as Record<string, unknown>;
			expect(result.description).toBe("My protocol");
			expect(result.lastModified).toBe("2025-01-01");
			expect(result.customField).toEqual({ nested: true });
		});

		it("does not add options to variables that have none", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: {
							name: "Person",
							variables: {
								v1: { name: "name", type: "text" },
							},
						},
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const v1 = getNestedValue(migrated.codebook, "node", "person", "variables", "v1") as Record<string, unknown>;
			expect(v1).not.toHaveProperty("options");
		});

		it("does not add variables to types that have none", () => {
			const protocol = makeProtocol({
				codebook: {
					node: {
						person: { name: "Person" },
					},
					edge: {},
					ego: { name: "ego" },
				},
			});

			const migrated = migrationV3toV4.migrate(protocol, {});
			const person = getNestedValue(migrated.codebook, "node", "person") as Record<string, unknown>;
			expect(person).not.toHaveProperty("variables");
		});
	});
});
