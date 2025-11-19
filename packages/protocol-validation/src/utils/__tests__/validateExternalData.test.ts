import { describe, expect, it } from "vitest";
import { getVariableNamesFromNetwork, validateNames } from "../validateExternalData";

describe("validateExternalData", () => {
	describe("getVariableNamesFromNetwork", () => {
		it("should extract unique attribute names from nodes", () => {
			const network = {
				nodes: [{ attributes: { name: "Alice", age: "30" } }, { attributes: { name: "Bob", gender: "M" } }],
				edges: [],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual(expect.arrayContaining(["name", "age", "gender"]));
			expect(result.length).toBe(3);
		});

		it("should extract unique attribute names from edges", () => {
			const network = {
				nodes: [],
				edges: [
					{ attributes: { type: "friend", since: "2020" } },
					{ attributes: { type: "colleague", strength: "strong" } },
				],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual(expect.arrayContaining(["type", "since", "strength"]));
			expect(result.length).toBe(3);
		});

		it("should extract unique attribute names from both nodes and edges", () => {
			const network = {
				nodes: [{ attributes: { name: "Alice", age: "30" } }, { attributes: { name: "Bob", location: "NYC" } }],
				edges: [{ attributes: { type: "friend", weight: "5" } }, { attributes: { type: "colleague" } }],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual(expect.arrayContaining(["name", "age", "location", "type", "weight"]));
			expect(result.length).toBe(5);
		});

		it("should not duplicate attribute names across items", () => {
			const network = {
				nodes: [
					{ attributes: { name: "Alice", age: "30" } },
					{ attributes: { name: "Bob", age: "25" } },
					{ attributes: { name: "Charlie", age: "35" } },
				],
				edges: [],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual(expect.arrayContaining(["name", "age"]));
			expect(result.length).toBe(2);
		});

		it("should handle empty nodes array", () => {
			const network = {
				nodes: [],
				edges: [{ attributes: { type: "friend" } }],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual(["type"]);
		});

		it("should handle empty edges array", () => {
			const network = {
				nodes: [{ attributes: { name: "Alice" } }],
				edges: [],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual(["name"]);
		});

		it("should handle empty network", () => {
			const network = {
				nodes: [],
				edges: [],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual([]);
		});

		it("should handle undefined nodes or edges", () => {
			const network = {
				nodes: undefined as never,
				edges: undefined as never,
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual([]);
		});

		it("should handle items with no attributes", () => {
			const network = {
				nodes: [{ attributes: {} }],
				edges: [{ attributes: {} }],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual([]);
		});

		it("should handle complex attribute names", () => {
			const network = {
				nodes: [
					{
						attributes: {
							"user.name": "Alice",
							user_id: "123",
							"data-value": "test",
							"ns:field": "value",
						},
					},
				],
				edges: [],
			};

			const result = getVariableNamesFromNetwork(network);
			expect(result).toEqual(expect.arrayContaining(["user.name", "user_id", "data-value", "ns:field"]));
			expect(result.length).toBe(4);
		});
	});

	describe("validateNames", () => {
		it("should return false for valid variable names", () => {
			const validNames = ["name", "age", "location", "user_id", "data.value", "ns:field", "item-type"];

			const result = validateNames(validNames);
			expect(result).toBe(false);
		});

		it("should return error message for names with spaces", () => {
			const invalidNames = ["first name", "last name"];

			const result = validateNames(invalidNames);
			expect(result).toContain("Variable name not allowed");
			expect(result).toContain("first name");
			expect(result).toContain("last name");
		});

		it("should return error message for names with special characters", () => {
			const invalidNames = ["name!", "age@", "data#field"];

			const result = validateNames(invalidNames);
			expect(result).toContain("Variable name not allowed");
			expect(result).toContain("name!");
			expect(result).toContain("age@");
			expect(result).toContain("data#field");
		});

		it("should allow underscores", () => {
			const validNames = ["user_name", "first_name", "user_id"];

			const result = validateNames(validNames);
			expect(result).toBe(false);
		});

		it("should allow dots", () => {
			const validNames = ["user.name", "data.value", "obj.prop"];

			const result = validateNames(validNames);
			expect(result).toBe(false);
		});

		it("should allow hyphens", () => {
			const validNames = ["user-name", "data-value", "item-type"];

			const result = validateNames(validNames);
			expect(result).toBe(false);
		});

		it("should allow colons", () => {
			const validNames = ["ns:field", "xml:lang", "prefix:name"];

			const result = validateNames(validNames);
			expect(result).toBe(false);
		});

		it("should allow alphanumeric characters", () => {
			const validNames = ["name1", "item2", "field123", "ABC", "abc123"];

			const result = validateNames(validNames);
			expect(result).toBe(false);
		});

		it("should return false for empty array", () => {
			const result = validateNames([]);
			expect(result).toBe(false);
		});

		it("should return false when no argument is provided", () => {
			const result = validateNames();
			expect(result).toBe(false);
		});

		it("should reject names starting with numbers if they contain invalid characters", () => {
			const invalidNames = ["1name!", "2field@"];

			const result = validateNames(invalidNames);
			expect(result).toContain("Variable name not allowed");
		});

		it("should identify only invalid names in mixed array", () => {
			const mixedNames = ["validName", "invalid name", "anotherValid", "bad@name"];

			const result = validateNames(mixedNames);
			expect(result).toContain("Variable name not allowed");
			expect(result).toContain("invalid name");
			expect(result).toContain("bad@name");
			expect(result).not.toContain("validName");
			expect(result).not.toContain("anotherValid");
		});

		it("should reject unicode characters", () => {
			const invalidNames = ["namé", "naïve", "名前"];

			const result = validateNames(invalidNames);
			expect(result).toContain("Variable name not allowed");
		});

		it("should reject empty string", () => {
			const invalidNames = [""];

			const result = validateNames(invalidNames);
			expect(result).toContain("Variable name not allowed");
		});

		it("should allow complex valid combinations", () => {
			const validNames = ["user.first-name", "data_value_123", "xml:ns:field", "item-type.sub_field:name"];

			const result = validateNames(validNames);
			expect(result).toBe(false);
		});
	});
});
