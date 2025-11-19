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

	describe("wildcard support", () => {
		it("should apply transformation to all keys matching wildcard", () => {
			const test = {
				codebook: {
					node: {
						person: {
							name: "Person",
							displayVariable: "name",
							color: "red",
						},
						organization: {
							name: "Organization",
							displayVariable: "orgName",
							color: "blue",
						},
					},
				},
			};

			let callCount = 0;
			const result = traverseAndTransform(test, [
				{
					paths: ["codebook.node.*"],
					fn: <V>(entity: V) => {
						callCount++;
						if (typeof entity === "object" && entity !== null) {
							// biome-ignore lint/correctness/noUnusedVariables: Destructuring to remove property
							const { displayVariable, ...rest } = entity as Record<string, unknown> & {
								displayVariable?: unknown;
							};
							return rest as V;
						}
						return entity;
					},
				},
			]);

			// Function should be called once for each key under node
			expect(callCount).toBe(2);

			// displayVariable should be removed from both entities
			expect(result.codebook.node.person).not.toHaveProperty("displayVariable");
			expect(result.codebook.node.organization).not.toHaveProperty("displayVariable");

			// Other properties should remain
			expect(result.codebook.node.person.name).toBe("Person");
			expect(result.codebook.node.person.color).toBe("red");
			expect(result.codebook.node.organization.name).toBe("Organization");
			expect(result.codebook.node.organization.color).toBe("blue");
		});

		it("should handle wildcards in nested paths", () => {
			const test = {
				codebook: {
					node: {
						person: {
							variables: {
								name: { type: "text", value: "John" },
								age: { type: "number", value: 30 },
							},
						},
						org: {
							variables: {
								title: { type: "text", value: "Corp" },
								size: { type: "number", value: 100 },
							},
						},
					},
				},
			};

			let callCount = 0;
			const result = traverseAndTransform(test, [
				{
					paths: ["codebook.node.*.variables"],
					fn: <V>(variables: V) => {
						callCount++;
						if (typeof variables === "object" && variables !== null) {
							const typedVars = variables as Record<string, unknown>;
							const modified: Record<string, unknown> = {};
							for (const [key, value] of Object.entries(typedVars)) {
								if (typeof value === "object" && value !== null) {
									const v = value as Record<string, unknown>;
									modified[key] = { ...v, modified: true };
								}
							}
							return modified as V;
						}
						return variables;
					},
				},
			]);

			// Function called once for person.variables and once for org.variables
			expect(callCount).toBe(2);

			// All variables should have modified flag
			expect(result.codebook.node.person.variables.name).toHaveProperty("modified", true);
			expect(result.codebook.node.person.variables.age).toHaveProperty("modified", true);
			expect(result.codebook.node.org.variables.title).toHaveProperty("modified", true);
			expect(result.codebook.node.org.variables.size).toHaveProperty("modified", true);
		});

		it("should handle multiple wildcards in a single path", () => {
			const test = {
				data: {
					group1: {
						item1: { value: 1 },
						item2: { value: 2 },
					},
					group2: {
						item3: { value: 3 },
						item4: { value: 4 },
					},
				},
			};

			let callCount = 0;
			const result = traverseAndTransform(test, [
				{
					paths: ["data.*.*"],
					fn: <V>(item: V) => {
						callCount++;
						if (typeof item === "object" && item !== null) {
							const i = item as Record<string, unknown>;
							return { ...i, processed: true } as V;
						}
						return item;
					},
				},
			]);

			// Should be called for each item (4 total)
			expect(callCount).toBe(4);

			expect(result.data.group1.item1).toHaveProperty("processed", true);
			expect(result.data.group1.item2).toHaveProperty("processed", true);
			expect(result.data.group2.item3).toHaveProperty("processed", true);
			expect(result.data.group2.item4).toHaveProperty("processed", true);

			// Original values should be preserved
			expect(result.data.group1.item1.value).toBe(1);
			expect(result.data.group2.item4.value).toBe(4);
		});

		it("should handle wildcard with empty object", () => {
			const test = {
				codebook: {
					node: {},
				},
			};

			let callCount = 0;
			const result = traverseAndTransform(test, [
				{
					paths: ["codebook.node.*"],
					fn: <V>(entity: V) => {
						callCount++;
						return entity;
					},
				},
			]);

			// No calls should be made for empty object
			expect(callCount).toBe(0);
			expect(result).toEqual(test);
		});

		it("should handle wildcard when parent doesn't exist", () => {
			const test = {
				codebook: {},
			};

			let callCount = 0;
			const result = traverseAndTransform(test, [
				{
					paths: ["codebook.node.*"],
					fn: <V>(entity: V) => {
						callCount++;
						return entity;
					},
				},
			]);

			// No calls should be made
			expect(callCount).toBe(0);
			expect(result).toEqual(test);
		});

		it("should handle wildcard when parent is not an object", () => {
			const test = {
				codebook: {
					node: "not an object",
				},
			};

			let callCount = 0;
			const result = traverseAndTransform(test, [
				{
					paths: ["codebook.node.*"],
					fn: <V>(entity: V) => {
						callCount++;
						return entity;
					},
				},
			]);

			// No calls should be made
			expect(callCount).toBe(0);
			expect(result).toEqual(test);
		});

		it("should combine wildcards with array notation", () => {
			const test = {
				stages: [
					{
						panels: {
							panel1: { filter: { type: "A" } },
							panel2: { filter: { type: "B" } },
						},
					},
					{
						panels: {
							panel3: { filter: { type: "C" } },
						},
					},
				],
			};

			let callCount = 0;
			const result = traverseAndTransform(test, [
				{
					paths: ["stages[].panels.*.filter"],
					fn: <V>(filter: V) => {
						callCount++;
						if (typeof filter === "object" && filter !== null) {
							return { ...(filter as Record<string, unknown>), modified: true } as V;
						}
						return filter;
					},
				},
			]);

			// Should be called 3 times (panel1, panel2, panel3)
			expect(callCount).toBe(3);

			// Extract panels and assert they exist
			const stage0 = result.stages[0];
			const stage1 = result.stages[1];
			expect(stage0).toBeDefined();
			expect(stage1).toBeDefined();
			expect(stage0?.panels).toBeDefined();
			expect(stage1?.panels).toBeDefined();

			const panels0 = stage0?.panels;
			const panels1 = stage1?.panels;

			if (!panels0 || !panels1) {
				throw new Error("Panels should be defined");
			}

			const panel1 = panels0.panel1 as { filter: { modified: boolean; type: string } };
			const panel2 = panels0.panel2 as { filter: { modified: boolean; type: string } };
			const panel3 = panels1.panel3 as { filter: { modified: boolean; type: string } };

			expect(panel1.filter).toHaveProperty("modified", true);
			expect(panel2.filter).toHaveProperty("modified", true);
			expect(panel3.filter).toHaveProperty("modified", true);

			expect(panel1.filter.type).toBe("A");
			expect(panel2.filter.type).toBe("B");
			expect(panel3.filter.type).toBe("C");
		});

		it("should preserve immutability with wildcards", () => {
			const test = {
				items: {
					a: { value: 1 },
					b: { value: 2 },
				},
			};

			const result = traverseAndTransform(test, [
				{
					paths: ["items.*"],
					fn: <V>(item: V) => {
						if (typeof item === "object" && item !== null) {
							const i = item as Record<string, unknown>;
							return { ...i, value: (i.value as number) * 10 } as V;
						}
						return item;
					},
				},
			]);

			// Original should be unchanged
			expect(test.items.a.value).toBe(1);
			expect(test.items.b.value).toBe(2);

			// Result should be modified
			expect(result.items.a.value).toBe(10);
			expect(result.items.b.value).toBe(20);
		});

		it("should handle real migration scenario - removing displayVariable", () => {
			const test = {
				codebook: {
					node: {
						person: {
							name: "Person",
							displayVariable: "name",
							color: "red",
						},
						place: {
							name: "Place",
							displayVariable: "location",
							color: "blue",
						},
					},
					edge: {
						knows: {
							name: "Knows",
							displayVariable: "strength",
							color: "green",
						},
					},
				},
			};

			const result = traverseAndTransform(test, [
				{
					paths: ["codebook.node.*", "codebook.edge.*"],
					fn: <V>(entityDefinition: V) => {
						if (typeof entityDefinition === "object" && entityDefinition !== null) {
							// biome-ignore lint/correctness/noUnusedVariables: Destructuring to remove property
							const { displayVariable, ...rest } = entityDefinition as Record<string, unknown> & {
								displayVariable?: unknown;
							};
							return rest as V;
						}
						return entityDefinition;
					},
				},
			]);

			// displayVariable should be removed from all entities
			expect(result.codebook.node.person).not.toHaveProperty("displayVariable");
			expect(result.codebook.node.place).not.toHaveProperty("displayVariable");
			expect(result.codebook.edge.knows).not.toHaveProperty("displayVariable");

			// Other properties should remain
			expect(result.codebook.node.person.name).toBe("Person");
			expect(result.codebook.node.place.name).toBe("Place");
			expect(result.codebook.edge.knows.name).toBe("Knows");
		});
	});
});
