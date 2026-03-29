import { describe, expect, it } from "vitest";
import { baseStageEntitySchema } from "../stages/base";
import { finishInterviewStageEntity } from "../stages/finish-interview";

describe("v9 baseStageEntitySchema", () => {
	it("accepts a valid stage entity", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Stage",
			label: "Welcome",
			target: "stage-2",
		});
		expect(result.success).toBe(true);
	});

	it("accepts a stage with no target (terminal)", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Stage",
			label: "Finish",
		});
		expect(result.success).toBe(true);
	});

	it("accepts optional interviewScript", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Stage",
			label: "Welcome",
			target: "stage-2",
			interviewScript: "Please read this aloud",
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing type", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			label: "Welcome",
		});
		expect(result.success).toBe(false);
	});

	it("rejects wrong type value", () => {
		const result = baseStageEntitySchema.safeParse({
			id: "stage-1",
			type: "Collection",
			label: "Welcome",
		});
		expect(result.success).toBe(false);
	});
});

describe("v9 finishInterviewStageEntity", () => {
	it("accepts a valid FinishInterview stage", () => {
		const result = finishInterviewStageEntity.safeParse({
			id: "finish-1",
			type: "Stage",
			stageType: "FinishInterview",
			label: "Thank you for participating",
		});
		expect(result.success).toBe(true);
	});

	it("accepts optional message content", () => {
		const result = finishInterviewStageEntity.safeParse({
			id: "finish-1",
			type: "Stage",
			stageType: "FinishInterview",
			label: "Thank you",
			message: "Your responses have been recorded.",
		});
		expect(result.success).toBe(true);
	});

	it("rejects if target is present", () => {
		const result = finishInterviewStageEntity.safeParse({
			id: "finish-1",
			type: "Stage",
			stageType: "FinishInterview",
			label: "Finish",
			target: "some-stage",
		});
		expect(result.success).toBe(false);
	});
});

import { branchEntitySchema } from "../timeline/branch";

describe("v9 branchEntitySchema", () => {
	it("accepts a valid branch with 2 slots", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Age Check",
			slots: [
				{
					id: "slot-1",
					label: "Under 18",
					filter: {
						join: "AND",
						rules: [
							{
								id: "rule-1",
								type: "ego",
								options: { attribute: "age", operator: "LESS_THAN", value: 18 },
							},
						],
					},
					target: "youth-path",
				},
				{
					id: "slot-2",
					label: "Default",
					default: true,
					target: "adult-path",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("rejects a branch with fewer than 2 slots", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Bad Branch",
			slots: [{ id: "slot-1", label: "Only one", default: true, target: "x" }],
		});
		expect(result.success).toBe(false);
	});

	it("rejects a branch with no default slot", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "No Default",
			slots: [
				{
					id: "slot-1",
					label: "A",
					filter: { join: "AND", rules: [] },
					target: "x",
				},
				{
					id: "slot-2",
					label: "B",
					filter: { join: "AND", rules: [] },
					target: "y",
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects a branch with multiple default slots", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Two Defaults",
			slots: [
				{ id: "slot-1", label: "A", default: true, target: "x" },
				{ id: "slot-2", label: "B", default: true, target: "y" },
			],
		});
		expect(result.success).toBe(false);
	});

	it("rejects duplicate slot IDs", () => {
		const result = branchEntitySchema.safeParse({
			id: "branch-1",
			type: "Branch",
			name: "Dup Slots",
			slots: [
				{ id: "same-id", label: "A", filter: { join: "AND", rules: [] }, target: "x" },
				{ id: "same-id", label: "B", default: true, target: "y" },
			],
		});
		expect(result.success).toBe(false);
	});
});
