import { describe, expect, it } from "vitest";
import ProtocolSchemaV9 from "../schema";

describe("v9 protocol superRefine validation", () => {
	const validCodebook = {
		node: {
			person: {
				name: "Person",
				color: "node-color-seq-1",
				icon: "add-a-person",
				shape: { default: "circle" },
				variables: {
					age: { name: "age", type: "number" },
				},
			},
		},
		edge: {},
	};

	it("rejects duplicate entity IDs", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s1", items: [] },
					{ id: "s1", type: "Stage", stageType: "FinishInterview", label: "B" },
				],
			},
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid stage subject reference", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{
						id: "s1",
						type: "Stage",
						stageType: "NameGenerator",
						label: "NG",
						target: "s2",
						subject: { entity: "node", type: "nonexistent" },
						form: { fields: [] },
						prompts: [{ id: "p1", text: "Name someone" }],
						behaviours: { minNodes: 0, maxNodes: 0 },
					},
					{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "Done" },
				],
			},
		});
		expect(result.success).toBe(false);
	});

	it("rejects cycle in timeline", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] },
					{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s1", items: [] },
				],
			},
		});
		expect(result.success).toBe(false);
	});

	it("accepts a valid v9 protocol with branches", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "Information", label: "Welcome", target: "b1", items: [] },
					{
						id: "b1",
						type: "Branch",
						name: "Split",
						slots: [
							{ id: "slot-1", label: "A", filter: { join: "AND", rules: [] }, target: "s2" },
							{ id: "slot-2", label: "Default", default: true, target: "s3" },
						],
					},
					{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "End A" },
					{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "End B" },
				],
			},
		});
		expect(result.success).toBe(true);
	});

	it("rejects orphaned entities", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [
					{ id: "s1", type: "Stage", stageType: "FinishInterview", label: "Done" },
					{ id: "s2", type: "Stage", stageType: "Information", label: "Orphan", items: [] },
				],
			},
		});
		expect(result.success).toBe(false);
	});

	it("rejects paths that don't terminate at FinishInterview", () => {
		const result = ProtocolSchemaV9.safeParse({
			name: "Test",
			schemaVersion: 9,
			codebook: validCodebook,
			timeline: {
				start: "s1",
				entities: [{ id: "s1", type: "Stage", stageType: "Information", label: "A", items: [] }],
			},
		});
		expect(result.success).toBe(false);
	});
});
