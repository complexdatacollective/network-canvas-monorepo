import type { Timeline } from "@codaco/protocol-validation";
import { describe, expect, it } from "vitest";
import timelineReducer, { timelineSliceActions } from "../timeline";

const basicTimeline: Timeline = {
	start: "s1",
	entities: [
		{ id: "s1", type: "Stage", stageType: "Information", label: "Welcome", target: "s2", items: [] },
		{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "Done" },
	] as Timeline["entities"],
};

const threeStageTimeline: Timeline = {
	start: "s1",
	entities: [
		{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] },
		{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s3", items: [] },
		{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "C" },
	] as Timeline["entities"],
};

describe("timeline reducer", () => {
	describe("setTimeline", () => {
		it("replaces the entire timeline", () => {
			const result = timelineReducer(
				{ start: "", entities: [] as Timeline["entities"] },
				timelineSliceActions.setTimeline(basicTimeline),
			);
			expect(result.start).toBe("s1");
			expect(result.entities).toHaveLength(2);
		});
	});

	describe("insertEntity", () => {
		it("inserts between two entities and rewires targets", () => {
			const newStage = {
				id: "s-new",
				type: "Stage" as const,
				stageType: "EgoForm" as const,
				label: "New",
				form: { fields: [] },
				introductionPanel: { title: "T", text: "T" },
			};
			const result = timelineReducer(
				basicTimeline,
				timelineSliceActions.insertEntity({ entity: newStage as Timeline["entities"][number], afterEntityId: "s1" }),
			);
			const s1 = result.entities.find((e) => e.id === "s1");
			expect(s1 && "target" in s1 ? s1.target : undefined).toBe("s-new");

			const sNew = result.entities.find((e) => e.id === "s-new");
			expect(sNew && "target" in sNew ? sNew.target : undefined).toBe("s2");
		});
	});

	describe("deleteEntity", () => {
		it("removes entity and rewires parent to target", () => {
			const result = timelineReducer(threeStageTimeline, timelineSliceActions.deleteEntity("s2"));
			expect(result.entities).toHaveLength(2);
			const s1 = result.entities.find((e) => e.id === "s1");
			expect(s1 && "target" in s1 ? s1.target : undefined).toBe("s3");
		});

		it("updates start when first entity is deleted", () => {
			const result = timelineReducer(threeStageTimeline, timelineSliceActions.deleteEntity("s1"));
			expect(result.start).toBe("s2");
		});
	});

	describe("updateEntity", () => {
		it("updates entity properties by merge", () => {
			const result = timelineReducer(
				basicTimeline,
				timelineSliceActions.updateEntity({ entityId: "s1", updates: { label: "Updated" } }),
			);
			const s1 = result.entities.find((e) => e.id === "s1");
			expect(s1 && "label" in s1 ? s1.label : undefined).toBe("Updated");
		});
	});

	describe("moveEntity", () => {
		it("moves entity to new position (after specified entity)", () => {
			// Move s3 to after s1 (between s1 and s2)
			const result = timelineReducer(
				threeStageTimeline,
				timelineSliceActions.moveEntity({ entityId: "s3", afterEntityId: "s1" }),
			);
			// s1 → s3 → s2
			const s1 = result.entities.find((e) => e.id === "s1");
			expect(s1 && "target" in s1 ? s1.target : undefined).toBe("s3");
		});
	});
});
