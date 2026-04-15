import type { Timeline } from "@codaco/protocol-validation";
import { describe, expect, it } from "vitest";
import { computeLayout } from "../layout";

describe("computeLayout", () => {
	it("assigns sequential rows for linear timeline", () => {
		const timeline: Timeline = {
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] },
				{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "B" },
			] as Timeline["entities"],
		};
		const layout = computeLayout(timeline);
		expect(layout.get("s1")).toMatchObject({ row: 0, column: 0 });
		expect(layout.get("s2")).toMatchObject({ row: 1, column: 0 });
	});

	it("splits into columns at branches", () => {
		const timeline: Timeline = {
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "b1", items: [] },
				{
					id: "b1",
					type: "Branch",
					name: "Split",
					slots: [
						{ id: "slot-1", label: "Left", filter: { join: "AND", rules: [] }, target: "s2" },
						{ id: "slot-2", label: "Right", default: true, target: "s3" },
					],
				},
				{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "End A" },
				{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "End B" },
			] as Timeline["entities"],
		};
		const layout = computeLayout(timeline);
		expect(layout.get("b1")?.row).toBe(1);
		const s2 = layout.get("s2");
		const s3 = layout.get("s3");
		expect(s2).toBeDefined();
		expect(s3).toBeDefined();
		expect(s2?.column).not.toBe(s3?.column);
		expect(s2?.row).toBe(2);
		expect(s3?.row).toBe(2);
	});

	it("places convergence point after longest path", () => {
		const timeline: Timeline = {
			start: "s1",
			entities: [
				{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "b1", items: [] },
				{
					id: "b1",
					type: "Branch",
					name: "Split",
					slots: [
						{ id: "slot-1", label: "Long", filter: { join: "AND", rules: [] }, target: "s2" },
						{ id: "slot-2", label: "Short", default: true, target: "s4" },
					],
				},
				{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s3", items: [] },
				{ id: "s3", type: "Stage", stageType: "Information", label: "C", target: "s4", items: [] },
				{ id: "s4", type: "Stage", stageType: "FinishInterview", label: "Converge" },
			] as Timeline["entities"],
		};
		const layout = computeLayout(timeline);
		const s4 = layout.get("s4");
		const s3 = layout.get("s3");
		expect(s4).toBeDefined();
		expect(s3).toBeDefined();
		// s4 should be placed after the longest path (row of s3 + 1)
		if (s4 !== undefined && s3 !== undefined) {
			expect(s4.row).toBeGreaterThan(s3.row);
		}
	});

	it("handles empty timeline gracefully", () => {
		const timeline: Timeline = {
			start: "s1",
			entities: [] as Timeline["entities"],
		};
		const layout = computeLayout(timeline);
		expect(layout.size).toBe(0);
	});
});
