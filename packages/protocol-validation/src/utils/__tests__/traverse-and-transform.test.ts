import { describe, expect, it } from "vitest";
import { traverseAndTransform } from "../traverse-and-transform";

describe("traverseAndTransform", () => {
	it("should process nested array filters", () => {
		const test = {
			stages: [
				{
					skipLogic: {
						filter: {
							type: "equals",
							attribute: "location",
							value: "New York",
						},
					},
					panels: [
						{
							filter: {
								type: "equals",
								attribute: "age",
								value: 30,
							},
						},
						{
							filter: {
								type: "equals",
								attribute: "location",
								value: "New York",
							},
						},
					],
				},
				{
					filter: {
						type: "equals",
						attribute: "age",
						value: 30,
					},
					panels: [
						{
							filter: {
								type: "equals",
								attribute: "location",
								value: "New York",
							},
						},
					],
				},
			],
		};

		let panelFilterCount = 0;
		let skipLogicFilterCount = 0;
		let stageFilterCount = 0;

		// Test processing panel filters (should be called 3 times)
		const result1 = traverseAndTransform(test, ["stages[].panels[].filter"], (filter) => {
			panelFilterCount++;
			return { ...filter, processed: true };
		});

		expect(panelFilterCount).toBe(3);
		expect(result1.stages?.[0]?.panels?.[0]?.filter).toHaveProperty("processed", true);
		expect(result1.stages?.[0]?.panels?.[1]?.filter).toHaveProperty("processed", true);
		expect(result1.stages?.[1]?.panels?.[0]?.filter).toHaveProperty("processed", true);

		// Test processing skipLogic filters (should be called 1 time)
		const result2 = traverseAndTransform(test, ["stages[].skipLogic.filter"], (filter) => {
			skipLogicFilterCount++;
			return { ...filter, skipProcessed: true };
		});

		expect(skipLogicFilterCount).toBe(1);
		expect(result2.stages?.[0]?.skipLogic?.filter).toHaveProperty("skipProcessed", true);

		// Test processing stage-level filters (should be called 1 time)
		const result3 = traverseAndTransform(test, ["stages[].filter"], (filter) => {
			stageFilterCount++;
			return { ...filter, stageProcessed: true };
		});

		expect(stageFilterCount).toBe(1);
		expect(result3.stages?.[1]?.filter).toHaveProperty("stageProcessed", true);
	});

	it("should process multiple paths in one call", () => {
		const test = {
			stages: [
				{
					skipLogic: {
						filter: { type: "equals", value: 1 },
					},
					panels: [{ filter: { type: "equals", value: 2 } }],
				},
				{
					filter: { type: "equals", value: 3 },
					panels: [{ filter: { type: "equals", value: 4 } }],
				},
			],
		};

		let callCount = 0;
		const result = traverseAndTransform(
			test,
			["stages[].panels[].filter", "stages[].skipLogic.filter", "stages[].filter"],
			(filter) => {
				callCount++;
				const f = filter as Record<string, unknown>;
				return { ...f, modified: true } as typeof filter;
			},
		);

		expect(callCount).toBe(4); // 2 panel filters + 1 skipLogic filter + 1 stage filter
		expect(result.stages?.[0]?.skipLogic?.filter).toHaveProperty("modified", true);
		expect(result.stages?.[0]?.panels?.[0]?.filter).toHaveProperty("modified", true);
		expect(result.stages?.[1]?.filter).toHaveProperty("modified", true);
		expect(result.stages?.[1]?.panels?.[0]?.filter).toHaveProperty("modified", true);
	});

	it("should handle missing paths gracefully", () => {
		const test = {
			stages: [{ id: 1 }, { id: 2 }],
		};

		const result = traverseAndTransform(test, ["stages[].nonExistent.filter"], (value) => {
			return { ...value, modified: true };
		});

		// Should return original structure unchanged
		expect(result).toEqual(test);
	});

	it("should handle non-array targets for array notation", () => {
		const test = {
			stages: { notAnArray: true },
		};

		const result = traverseAndTransform(test, ["stages[].filter"], (value) => {
			return { ...value, modified: true };
		});

		// Should return original structure unchanged
		expect(result).toEqual(test);
	});

	it("should preserve object immutability", () => {
		const test = {
			stages: [
				{
					filter: { type: "original" },
				},
			],
		};

		const result = traverseAndTransform(test, ["stages[].filter"], (filter) => {
			const f = filter as { type: string };
			return { ...f, type: "modified" } as typeof filter;
		});

		// Original should be unchanged
		expect(test.stages[0]?.filter?.type).toBe("original");
		// Result should be modified
		expect(result.stages[0]?.filter?.type).toBe("modified");
	});

	it("should handle deeply nested paths", () => {
		const test = {
			a: {
				b: [
					{
						c: {
							d: [{ e: { value: 1 } }, { e: { value: 2 } }],
						},
					},
				],
			},
		};

		let count = 0;
		const result = traverseAndTransform(test, ["a.b[].c.d[].e"], (value) => {
			count++;
			const v = value as { value: number };
			return { ...v, value: v.value * 10 } as typeof value;
		});

		expect(count).toBe(2);
		expect(result.a?.b?.[0]?.c?.d?.[0]?.e?.value).toBe(10);
		expect(result.a?.b?.[0]?.c?.d?.[1]?.e?.value).toBe(20);
	});
});
