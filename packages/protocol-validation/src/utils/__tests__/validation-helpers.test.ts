import { describe, expect, it } from "vitest";
import { createBaseProtocol } from "../test-utils";
import {
	createValidationMessage,
	entityExists,
	filterRuleAttributeExists,
	filterRuleEntityExists,
	findDuplicateId,
	findDuplicateName,
	getAllEntityNames,
	getVariableNames,
	getVariablesForSubject,
	variableExists,
	variableHasType,
} from "../validation-helpers";

/**
 * Tests for validation helper functions used in superrefine validation
 */
describe("Validation Helpers", () => {
	const baseProtocol = createBaseProtocol();
	const codebook = baseProtocol.codebook;

	describe("entityExists", () => {
		it("returns true for existing ego entity", () => {
			const result = entityExists(codebook, { entity: "ego" });
			expect(result).toBe(true);
		});

		it("returns false for non-existing ego entity", () => {
			const codebookWithoutEgo = { ...codebook, ego: undefined };
			const result = entityExists(codebookWithoutEgo, { entity: "ego" });
			expect(result).toBe(false);
		});

		it("returns true for existing node type", () => {
			const result = entityExists(codebook, { entity: "node", type: "person" });
			expect(result).toBe(true);
		});

		it("returns false for non-existing node type", () => {
			const result = entityExists(codebook, { entity: "node", type: "nonexistent" });
			expect(result).toBe(false);
		});

		it("returns true for existing edge type", () => {
			const result = entityExists(codebook, { entity: "edge", type: "knows" });
			expect(result).toBe(true);
		});

		it("returns false for non-existing edge type", () => {
			const result = entityExists(codebook, { entity: "edge", type: "nonexistent" });
			expect(result).toBe(false);
		});

		it("returns false for node entity when no nodes exist", () => {
			const codebookWithoutNodes = { ...codebook, node: undefined };
			const result = entityExists(codebookWithoutNodes, { entity: "node", type: "person" });
			expect(result).toBe(false);
		});

		it("returns false for edge entity when no edges exist", () => {
			const codebookWithoutEdges = { ...codebook, edge: undefined };
			const result = entityExists(codebookWithoutEdges, { entity: "edge", type: "knows" });
			expect(result).toBe(false);
		});
	});

	describe("getVariablesForSubject", () => {
		it("returns ego variables for ego subject", () => {
			const result = getVariablesForSubject(codebook, { entity: "ego" });
			expect(result).toEqual(codebook.ego.variables);
			expect(Object.keys(result)).toContain("egoName");
			expect(Object.keys(result)).toContain("egoAge");
		});

		it("returns empty object for ego subject when ego doesn't exist", () => {
			const codebookWithoutEgo = { ...codebook, ego: undefined };
			const result = getVariablesForSubject(codebookWithoutEgo, { entity: "ego" });
			expect(result).toEqual({});
		});

		it("returns node variables for node subject", () => {
			const result = getVariablesForSubject(codebook, { entity: "node", type: "person" });
			expect(result).toEqual(codebook.node.person.variables);
			expect(Object.keys(result)).toContain("name");
			expect(Object.keys(result)).toContain("age");
		});

		it("returns empty object for non-existing node type", () => {
			const result = getVariablesForSubject(codebook, { entity: "node", type: "nonexistent" });
			expect(result).toEqual({});
		});

		it("returns edge variables for edge subject", () => {
			const result = getVariablesForSubject(codebook, { entity: "edge", type: "knows" });
			expect(result).toEqual(codebook.edge.knows.variables);
			expect(Object.keys(result)).toContain("closeness");
			expect(Object.keys(result)).toContain("duration");
		});

		it("returns empty object for non-existing edge type", () => {
			const result = getVariablesForSubject(codebook, { entity: "edge", type: "nonexistent" });
			expect(result).toEqual({});
		});

		it("returns empty object when node collection doesn't exist", () => {
			const codebookWithoutNodes = { ...codebook, node: undefined };
			const result = getVariablesForSubject(codebookWithoutNodes, { entity: "node", type: "person" });
			expect(result).toEqual({});
		});
	});

	describe("variableExists", () => {
		it("returns true for existing ego variable", () => {
			const result = variableExists(codebook, { entity: "ego" }, "egoName");
			expect(result).toBe(true);
		});

		it("returns false for non-existing ego variable", () => {
			const result = variableExists(codebook, { entity: "ego" }, "nonexistent");
			expect(result).toBe(false);
		});

		it("returns true for existing node variable", () => {
			const result = variableExists(codebook, { entity: "node", type: "person" }, "name");
			expect(result).toBe(true);
		});

		it("returns false for non-existing node variable", () => {
			const result = variableExists(codebook, { entity: "node", type: "person" }, "nonexistent");
			expect(result).toBe(false);
		});

		it("returns true for existing edge variable", () => {
			const result = variableExists(codebook, { entity: "edge", type: "knows" }, "closeness");
			expect(result).toBe(true);
		});

		it("returns false for non-existing edge variable", () => {
			const result = variableExists(codebook, { entity: "edge", type: "knows" }, "nonexistent");
			expect(result).toBe(false);
		});

		it("returns false when subject doesn't exist", () => {
			const result = variableExists(codebook, { entity: "node", type: "nonexistent" }, "name");
			expect(result).toBe(false);
		});
	});

	describe("variableHasType", () => {
		it("returns true when variable has expected type", () => {
			const result = variableHasType(codebook, { entity: "node", type: "person" }, "name", "text");
			expect(result).toBe(true);
		});

		it("returns false when variable has different type", () => {
			const result = variableHasType(codebook, { entity: "node", type: "person" }, "name", "number");
			expect(result).toBe(false);
		});

		it("returns false when variable doesn't exist", () => {
			const result = variableHasType(codebook, { entity: "node", type: "person" }, "nonexistent", "text");
			expect(result).toBe(false);
		});

		it("returns true for ordinal edge variable", () => {
			const result = variableHasType(codebook, { entity: "edge", type: "knows" }, "closeness", "ordinal");
			expect(result).toBe(true);
		});

		it("returns false for ordinal edge variable checked as number", () => {
			const result = variableHasType(codebook, { entity: "edge", type: "knows" }, "closeness", "number");
			expect(result).toBe(false);
		});
	});

	describe("findDuplicateId", () => {
		it("returns null for array with unique IDs", () => {
			const items = [{ id: "item1" }, { id: "item2" }, { id: "item3" }];
			const result = findDuplicateId(items);
			expect(result).toBeNull();
		});

		it("returns first duplicate ID found", () => {
			const items = [
				{ id: "item1" },
				{ id: "item2" },
				{ id: "item1" }, // Duplicate
			];
			const result = findDuplicateId(items);
			expect(result).toBe("item1");
		});

		it("returns first duplicate when multiple duplicates exist", () => {
			const items = [
				{ id: "item1" },
				{ id: "item2" },
				{ id: "item1" }, // First duplicate
				{ id: "item3" },
				{ id: "item2" }, // Second duplicate
			];
			const result = findDuplicateId(items);
			expect(result).toBe("item1");
		});

		it("returns null for empty array", () => {
			const result = findDuplicateId([]);
			expect(result).toBeNull();
		});

		it("returns null for single item", () => {
			const items = [{ id: "item1" }];
			const result = findDuplicateId(items);
			expect(result).toBeNull();
		});
	});

	describe("findDuplicateName", () => {
		it("returns null for array with unique names", () => {
			const names = ["name1", "name2", "name3"];
			const result = findDuplicateName(names);
			expect(result).toBeNull();
		});

		it("returns first duplicate name found", () => {
			const names = ["name1", "name2", "name1"];
			const result = findDuplicateName(names);
			expect(result).toBe("name1");
		});

		it("returns null for empty array", () => {
			const result = findDuplicateName([]);
			expect(result).toBeNull();
		});

		it("handles case sensitive duplicates", () => {
			const names = ["Name", "name", "NAME"];
			const result = findDuplicateName(names);
			expect(result).toBeNull(); // These are different strings
		});
	});

	describe("getAllEntityNames", () => {
		it("returns all entity names from codebook", () => {
			const result = getAllEntityNames(codebook);
			expect(result).toContain("Person");
			expect(result).toContain("Colleague");
			expect(result).toContain("Knows");
			expect(result).toContain("Collaborates");
			expect(result).toHaveLength(4);
		});

		it("returns empty array for empty codebook", () => {
			const emptyCodebook = {};
			const result = getAllEntityNames(emptyCodebook);
			expect(result).toEqual([]);
		});

		it("returns only node names when edges don't exist", () => {
			const codebookWithoutEdges = { ...codebook, edge: undefined };
			const result = getAllEntityNames(codebookWithoutEdges);
			expect(result).toContain("Person");
			expect(result).toContain("Colleague");
			expect(result).not.toContain("Knows");
			expect(result).not.toContain("Collaborates");
		});

		it("returns only edge names when nodes don't exist", () => {
			const codebookWithoutNodes = { ...codebook, node: undefined };
			const result = getAllEntityNames(codebookWithoutNodes);
			expect(result).toContain("Knows");
			expect(result).toContain("Collaborates");
			expect(result).not.toContain("Person");
			expect(result).not.toContain("Colleague");
		});
	});

	describe("getVariableNames", () => {
		it("returns variable names from variables object", () => {
			const variables = codebook.node.person.variables;
			const result = getVariableNames(variables);
			expect(result).toContain("Name");
			expect(result).toContain("Age");
			expect(result).toContain("Category");
			expect(result).toContain("Relationship_Strength");
		});

		it("returns empty array for undefined variables", () => {
			const result = getVariableNames(undefined);
			expect(result).toEqual([]);
		});

		it("returns empty array for empty variables object", () => {
			const result = getVariableNames({});
			expect(result).toEqual([]);
		});
	});

	describe("filterRuleEntityExists", () => {
		it("returns true for ego rule when ego exists", () => {
			const rule = { id: "rule1", type: "ego" as const, options: {} };
			const result = filterRuleEntityExists(rule, codebook);
			expect(result).toBe(true);
		});

		it("returns false for ego rule when ego doesn't exist", () => {
			const codebookWithoutEgo = { ...codebook, ego: undefined };
			const rule = { id: "rule1", type: "ego" as const, options: {} };
			const result = filterRuleEntityExists(rule, codebookWithoutEgo);
			expect(result).toBe(false);
		});

		it("returns true for alter rule with existing node type", () => {
			const rule = { id: "rule1", type: "alter" as const, options: { type: "person" } };
			const result = filterRuleEntityExists(rule, codebook);
			expect(result).toBe(true);
		});

		it("returns false for alter rule with non-existing node type", () => {
			const rule = { id: "rule1", type: "alter" as const, options: { type: "nonexistent" } };
			const result = filterRuleEntityExists(rule, codebook);
			expect(result).toBe(false);
		});

		it("returns true for edge rule with existing edge type", () => {
			const rule = { id: "rule1", type: "edge" as const, options: { type: "knows" } };
			const result = filterRuleEntityExists(rule, codebook);
			expect(result).toBe(true);
		});

		it("returns false for edge rule with non-existing edge type", () => {
			const rule = { id: "rule1", type: "edge" as const, options: { type: "nonexistent" } };
			const result = filterRuleEntityExists(rule, codebook);
			expect(result).toBe(false);
		});

		it("returns false when options.type is missing for alter rule", () => {
			const rule = { id: "rule1", type: "alter" as const, options: {} };
			const result = filterRuleEntityExists(rule, codebook);
			expect(result).toBe(false);
		});
	});

	describe("filterRuleAttributeExists", () => {
		it("returns true when no attribute is specified", () => {
			const rule = { id: "rule1", type: "alter" as const, options: { type: "person" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(true);
		});

		it("returns true for ego rule with existing ego attribute", () => {
			const rule = { id: "rule1", type: "ego" as const, options: { attribute: "egoName" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(true);
		});

		it("returns false for ego rule with non-existing ego attribute", () => {
			const rule = { id: "rule1", type: "ego" as const, options: { attribute: "nonexistent" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(false);
		});

		it("returns true for alter rule with existing node attribute", () => {
			const rule = { id: "rule1", type: "alter" as const, options: { type: "person", attribute: "name" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(true);
		});

		it("returns false for alter rule with non-existing node attribute", () => {
			const rule = { id: "rule1", type: "alter" as const, options: { type: "person", attribute: "nonexistent" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(false);
		});

		it("returns true for edge rule with existing edge attribute", () => {
			const rule = { id: "rule1", type: "edge" as const, options: { type: "knows", attribute: "closeness" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(true);
		});

		it("returns false for edge rule with non-existing edge attribute", () => {
			const rule = { id: "rule1", type: "edge" as const, options: { type: "knows", attribute: "nonexistent" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(false);
		});

		it("returns false when entity doesn't exist", () => {
			const rule = { id: "rule1", type: "alter" as const, options: { type: "nonexistent", attribute: "name" } };
			const result = filterRuleAttributeExists(rule, codebook);
			expect(result).toBe(false);
		});
	});

	describe("createValidationMessage", () => {
		it("returns base message when no context provided", () => {
			const result = createValidationMessage("Base error message");
			expect(result).toBe("Base error message");
		});

		it("appends ego entity context", () => {
			const result = createValidationMessage("Base error", { subject: { entity: "ego" } });
			expect(result).toBe("Base error (ego entity)");
		});

		it("appends node entity context", () => {
			const result = createValidationMessage("Base error", { subject: { entity: "node", type: "person" } });
			expect(result).toBe("Base error (node[person])");
		});

		it("appends edge entity context", () => {
			const result = createValidationMessage("Base error", { subject: { entity: "edge", type: "knows" } });
			expect(result).toBe("Base error (edge[knows])");
		});

		it("appends variable context", () => {
			const result = createValidationMessage("Base error", { variable: "testVar" });
			expect(result).toBe('Base error - variable: "testVar"');
		});

		it("appends entity context", () => {
			const result = createValidationMessage("Base error", { entity: "testEntity" });
			expect(result).toBe('Base error - entity: "testEntity"');
		});

		it("combines multiple context elements", () => {
			const result = createValidationMessage("Base error", {
				subject: { entity: "node", type: "person" },
				variable: "testVar",
				entity: "testEntity",
			});
			expect(result).toBe('Base error (node[person]) - variable: "testVar" - entity: "testEntity"');
		});
	});

	describe("Edge Cases", () => {
		it("handles codebook with null values", () => {
			const codebookWithNulls = {
				ego: null,
				node: null,
				edge: null,
			};

			// null !== undefined, so entityExists returns true but getVariables handles null gracefully
			const result1 = entityExists(codebookWithNulls, { entity: "ego" });
			expect(result1).toBe(true); // null !== undefined

			const result2 = getVariablesForSubject(codebookWithNulls, { entity: "node", type: "person" });
			expect(result2).toEqual({}); // null entity returns empty object
		});

		it("handles empty entity collections", () => {
			const codebookWithEmptyCollections = {
				ego: { variables: {} },
				node: {},
				edge: {},
			};

			const result1 = getAllEntityNames(codebookWithEmptyCollections);
			expect(result1).toEqual([]);

			const result2 = getVariableNames(codebookWithEmptyCollections.ego.variables);
			expect(result2).toEqual([]);
		});

		it("handles malformed variable structures", () => {
			const malformedCodebook = {
				node: {
					person: {
						name: "Person",
						variables: {
							malformed: "not an object",
							normal: {
								name: "Normal Variable",
								type: "text",
							},
						},
					},
				},
			};

			// Should handle gracefully without throwing
			const result = getVariablesForSubject(malformedCodebook, { entity: "node", type: "person" });
			expect(result.normal).toBeDefined();
			expect(result.malformed).toBe("not an object");
		});
	});
});
