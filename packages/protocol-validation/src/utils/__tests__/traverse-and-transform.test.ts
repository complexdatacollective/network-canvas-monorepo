import { describe, expect, it } from "vitest";
import { traverseAndTransform } from "../traverse-and-transform";

describe("traverseAndTransform", () => {
	it("should process multiple transformations in sequence", () => {
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

		// Test processing all filters with the new array format
		const result = traverseAndTransform(test, [
			{
				// Process panel filters (should be called 3 times)
				paths: ["stages[].panels[].filter"],
				fn: <V>(filter: V) => {
					panelFilterCount++;
					return { ...filter, processed: true };
				},
			},
			{
				// Process skipLogic filters (should be called 1 time)
				paths: ["stages[].skipLogic.filter"],
				fn: <V>(filter: V) => {
					skipLogicFilterCount++;
					return { ...filter, skipProcessed: true };
				},
			},
			{
				// Process stage-level filters (should be called 1 time)
				paths: ["stages[].filter"],
				fn: <V>(filter: V) => {
					stageFilterCount++;
					return { ...filter, stageProcessed: true };
				},
			},
		]);

		expect(panelFilterCount).toBe(3);
		expect(skipLogicFilterCount).toBe(1);
		expect(stageFilterCount).toBe(1);

		expect(result.stages?.[0]?.panels?.[0]?.filter).toHaveProperty("processed", true);
		expect(result.stages?.[0]?.panels?.[1]?.filter).toHaveProperty("processed", true);
		expect(result.stages?.[1]?.panels?.[0]?.filter).toHaveProperty("processed", true);
		expect(result.stages?.[0]?.skipLogic?.filter).toHaveProperty("skipProcessed", true);
		expect(result.stages?.[1]?.filter).toHaveProperty("stageProcessed", true);
	});

	it("should process multiple paths in one transformation", () => {
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
		const result = traverseAndTransform(test, [
			{
				paths: ["stages[].panels[].filter", "stages[].skipLogic.filter", "stages[].filter"],
				fn: <V>(filter: V) => {
					callCount++;
					return { ...filter, modified: true };
				},
			},
		]);

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

		const result = traverseAndTransform(test, [
			{
				paths: ["stages[].nonExistent.filter"],
				fn: <V>(value: V) => {
					return { ...value, modified: true };
				},
			},
		]);

		// Should return original structure unchanged
		expect(result).toEqual(test);
	});

	it("should handle non-array targets for array notation", () => {
		const test = {
			stages: { notAnArray: true },
		};

		const result = traverseAndTransform(test, [
			{
				paths: ["stages[].filter"],
				fn: <V>(value: V) => {
					return { ...value, modified: true };
				},
			},
		]);

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

		const result = traverseAndTransform(test, [
			{
				paths: ["stages[].filter"],
				fn: <V>(filter: V) => {
					const f = filter as { type: string };
					return { ...f, type: "modified" } as V;
				},
			},
		]);

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
		const result = traverseAndTransform(test, [
			{
				paths: ["a.b[].c.d[].e"],
				fn: <V>(value: V) => {
					count++;
					const v = value as { value: number };
					return { ...v, value: v.value * 10 } as V;
				},
			},
		]);

		expect(count).toBe(2);
		expect(result.a?.b?.[0]?.c?.d?.[0]?.e?.value).toBe(10);
		expect(result.a?.b?.[0]?.c?.d?.[1]?.e?.value).toBe(20);
	});

	it("should handle root-level transformations", () => {
		const test = {
			schemaVersion: 7,
			data: "test",
		};

		type ResultType = typeof test & { newField: string };

		const result = traverseAndTransform(test, [
			{
				paths: [""],
				fn: <V>(protocol: V) =>
					({
						...(protocol as typeof test),
						schemaVersion: 8,
						newField: "added",
					}) as V,
			},
		]) as ResultType;

		expect(result.schemaVersion).toBe(8);
		expect(result.data).toBe("test");
		expect(result.newField).toBe("added");
	});

	it("should apply transformations in sequence", () => {
		const test = {
			value: 1,
			nested: {
				value: 10,
			},
		};

		type ResultType = typeof test & { total: number };

		const result = traverseAndTransform(test, [
			{
				paths: ["value"],
				fn: <V>(value: V) => ((value as number) * 2) as V,
			},
			{
				paths: ["nested.value"],
				fn: <V>(value: V) => ((value as number) + 5) as V,
			},
			{
				paths: [""],
				fn: <V>(obj: V) => {
					const o = obj as typeof test;
					return {
						...o,
						total: o.value + o.nested.value,
					} as V;
				},
			},
		]) as ResultType;

		expect(result.value).toBe(2); // 1 * 2
		expect(result.nested.value).toBe(15); // 10 + 5
		expect(result.total).toBe(17); // 2 + 15
	});
});
