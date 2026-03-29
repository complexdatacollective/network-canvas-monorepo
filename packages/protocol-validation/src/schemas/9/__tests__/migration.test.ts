import { describe, expect, it } from "vitest";
import migrationV8toV9 from "../migration";

describe("v8 to v9 migration", () => {
	it("converts a simple linear protocol", () => {
		const v8 = {
			schemaVersion: 8,
			name: "Test",
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "Information", label: "Welcome", items: [] },
				{
					id: "s2",
					type: "EgoForm",
					label: "Demographics",
					form: { fields: [] },
					introductionPanel: { title: "T", text: "T" },
				},
			],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});

		expect(result.schemaVersion).toBe(9);
		expect(result).not.toHaveProperty("stages");
		expect(result).toHaveProperty("timeline");

		const timeline = (result as Record<string, unknown>).timeline as {
			start: string;
			entities: Array<Record<string, unknown>>;
		};

		expect(timeline.start).toBe("s1");
		// Original 2 stages + appended FinishInterview = 3
		expect(timeline.entities).toHaveLength(3);

		// First entity
		expect(timeline.entities[0]).toMatchObject({
			id: "s1",
			type: "Stage",
			stageType: "Information",
			target: "s2",
		});

		// Second entity
		expect(timeline.entities[1]).toMatchObject({
			id: "s2",
			type: "Stage",
			stageType: "EgoForm",
			target: expect.any(String), // targets the FinishInterview
		});

		// Last entity should be FinishInterview
		const lastEntity = timeline.entities[timeline.entities.length - 1];
		expect(lastEntity).toMatchObject({
			type: "Stage",
			stageType: "FinishInterview",
		});
		expect(lastEntity).not.toHaveProperty("target");
	});

	it("converts skip logic to branches (SKIP action)", () => {
		const v8 = {
			schemaVersion: 8,
			name: "Test",
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "Information", label: "Welcome", items: [] },
				{
					id: "s2",
					type: "EgoForm",
					label: "Demographics",
					form: { fields: [] },
					introductionPanel: { title: "T", text: "T" },
					skipLogic: {
						action: "SKIP",
						filter: {
							join: "AND",
							rules: [
								{
									id: "r1",
									type: "ego",
									options: { attribute: "age", operator: "LESS_THAN", value: 18 },
								},
							],
						},
					},
				},
				{ id: "s3", type: "Information", label: "Thank You", items: [] },
			],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});
		const timeline = (result as Record<string, unknown>).timeline as {
			start: string;
			entities: Array<Record<string, unknown>>;
		};

		// Should have a Branch entity
		const branchEntity = timeline.entities.find((e) => e.type === "Branch");
		expect(branchEntity).toBeDefined();
		expect((branchEntity as Record<string, unknown>).name).toContain("Demographics");

		// s1 should target the branch
		expect(timeline.entities[0]).toMatchObject({ id: "s1", target: branchEntity?.id });

		// No entity has skipLogic
		for (const entity of timeline.entities) {
			expect(entity).not.toHaveProperty("skipLogic");
		}

		// SKIP: condition slot targets the stage AFTER s2 (s3), default targets s2
		const slots = (branchEntity as Record<string, unknown>).slots as Array<Record<string, unknown>>;
		const conditionSlot = slots.find((s) => !s.default);
		const defaultSlot = slots.find((s) => s.default);
		expect(conditionSlot?.target).toBe("s3"); // Skip → goes to s3
		expect(defaultSlot?.target).toBe("s2"); // Default → proceed to s2
	});

	it("converts SHOW skip logic action", () => {
		const v8 = {
			schemaVersion: 8,
			name: "Test",
			codebook: { node: {}, edge: {} },
			stages: [
				{ id: "s1", type: "Information", label: "Welcome", items: [] },
				{
					id: "s2",
					type: "EgoForm",
					label: "Optional Form",
					form: { fields: [] },
					introductionPanel: { title: "T", text: "T" },
					skipLogic: {
						action: "SHOW",
						filter: { join: "AND", rules: [] },
					},
				},
				{ id: "s3", type: "Information", label: "End", items: [] },
			],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});
		const timeline = (result as Record<string, unknown>).timeline as {
			start: string;
			entities: Array<Record<string, unknown>>;
		};

		const branchEntity = timeline.entities.find((e) => e.type === "Branch") as Record<string, unknown>;
		const slots = branchEntity.slots as Array<Record<string, unknown>>;

		// SHOW: condition match → show (target s2), default → skip (target s3)
		const conditionSlot = slots.find((s) => !s.default);
		const defaultSlot = slots.find((s) => s.default);
		expect(conditionSlot?.target).toBe("s2");
		expect(defaultSlot?.target).toBe("s3");
	});

	it("handles protocol with no stages", () => {
		const v8 = {
			schemaVersion: 8,
			name: "Test",
			codebook: { node: {}, edge: {} },
			stages: [],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});
		const timeline = (result as Record<string, unknown>).timeline as {
			start: string;
			entities: Array<Record<string, unknown>>;
		};

		// Should have just a FinishInterview
		expect(timeline.entities).toHaveLength(1);
		expect(timeline.entities[0]).toMatchObject({ type: "Stage", stageType: "FinishInterview" });
	});

	it("preserves codebook and other protocol fields", () => {
		const v8 = {
			schemaVersion: 8,
			name: "My Protocol",
			description: "A test protocol",
			codebook: {
				node: {
					person: {
						name: "Person",
						color: "coral",
						icon: "add-a-person",
						shape: { default: "circle" },
						variables: {},
					},
				},
				edge: {},
			},
			stages: [{ id: "s1", type: "Information", label: "Info", items: [] }],
		};

		const result = migrationV8toV9.migrate(v8 as never, {});
		expect((result as Record<string, unknown>).name).toBe("My Protocol");
		expect((result as Record<string, unknown>).description).toBe("A test protocol");
		expect((result as Record<string, unknown>).codebook).toEqual(v8.codebook);
	});
});
