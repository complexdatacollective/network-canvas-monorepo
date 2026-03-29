import { describe, expect, it } from "vitest";
import { baseStageEntitySchema } from "../stages/base";

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
