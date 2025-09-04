import { describe, expect, it } from "vitest";
import { EdgeDefinitionSchema, NodeDefinitionSchema } from "../codebook/definitions";
import { StageSubjectSchema } from "../common/subjects";
import { FilterSchema } from "../filters/filter";
import { VariablesSchema } from "../variables";

describe("Protocol Schema Mock Generation", () => {
	describe("Filter Schema", () => {
		it("should generate mock filter data", () => {
			const mockFilter = FilterSchema.generateMock();

			expect(mockFilter).toHaveProperty("rules");
			expect(Array.isArray(mockFilter.rules)).toBe(true);
			expect(mockFilter.rules.length).toBeGreaterThan(0);

			// Check first rule
			const firstRule = mockFilter.rules[0];
			expect(firstRule).toBeDefined();
			expect(firstRule).toHaveProperty("type");
			expect(firstRule).toHaveProperty("id");
			expect(firstRule).toHaveProperty("options");
			expect(["node", "ego", "edge"]).toContain(firstRule.type);
		});
	});

	describe("Stage Subject Schema", () => {
		it("should generate mock stage subject data", () => {
			const mockSubject = StageSubjectSchema.generateMock();

			expect(mockSubject).toHaveProperty("entity");
			expect(["node", "ego", "edge"]).toContain(mockSubject.entity);

			if (mockSubject.entity !== "ego") {
				expect(mockSubject).toHaveProperty("type");
			}
		});
	});

	describe("Node Definition Schema", () => {
		it("should generate mock node definition data", () => {
			const mockNodeDef = NodeDefinitionSchema.generateMock();

			expect(mockNodeDef).toHaveProperty("name");
			expect(mockNodeDef).toHaveProperty("color");
			expect(typeof mockNodeDef.name).toBe("string");
			expect(typeof mockNodeDef.color).toBe("string");
			expect(mockNodeDef.color).toMatch(/^#[0-9a-f]{6}$/i);
		});
	});

	describe("Edge Definition Schema", () => {
		it("should generate mock edge definition data", () => {
			const mockEdgeDef = EdgeDefinitionSchema.generateMock();

			expect(mockEdgeDef).toHaveProperty("name");
			expect(mockEdgeDef).toHaveProperty("color");
			expect(typeof mockEdgeDef.name).toBe("string");
			expect(typeof mockEdgeDef.color).toBe("string");
			expect(mockEdgeDef.color).toMatch(/^#[0-9a-f]{6}$/i);
		});
	});

	describe("Variables Schema", () => {
		it("should generate mock variables data", () => {
			const mockVariables = VariablesSchema.generateMock();

			expect(typeof mockVariables).toBe("object");
			const variableNames = Object.keys(mockVariables);
			expect(variableNames.length).toBeGreaterThan(0);

			// Check each variable has required properties
			for (const [_varName, variable] of Object.entries(mockVariables)) {
				expect(variable).toHaveProperty("name");
				expect(variable).toHaveProperty("type");
				expect(typeof variable.name).toBe("string");
				expect(typeof variable.type).toBe("string");
			}
		});
	});

	describe("Schema Integration", () => {
		it("should generate valid mock data that passes schema validation", () => {
			const mockFilter = FilterSchema.generateMock();
			const parseResult = FilterSchema.safeParse(mockFilter);

			expect(parseResult.success).toBe(true);
		});
	});
});
