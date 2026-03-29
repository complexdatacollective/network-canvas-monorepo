import { describe, expect, it } from "vitest";
import type { Entity } from "../timeline/entity";
import { buildEntityIndex, flattenAllEntities, flattenStageEntities } from "../validation/flatten";

const linearTimeline: Entity[] = [
	{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] } as Entity,
	{ id: "s2", type: "Stage", stageType: "FinishInterview", label: "B" } as Entity,
];

const nestedTimeline: Entity[] = [
	{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "coll-1", items: [] } as Entity,
	{
		id: "coll-1",
		type: "Collection",
		name: "Group",
		children: [
			{
				id: "s2",
				type: "Stage",
				stageType: "EgoForm",
				label: "B",
				target: "s3",
				form: { fields: [] },
				introductionPanel: { title: "T", text: "T" },
			} as Entity,
			{ id: "s3", type: "Stage", stageType: "FinishInterview", label: "C" } as Entity,
		],
	} as Entity,
];

describe("flattenAllEntities", () => {
	it("returns all entities from a flat timeline", () => {
		const result = flattenAllEntities(linearTimeline);
		expect(result).toHaveLength(2);
		expect(result.map((e) => e.id)).toEqual(["s1", "s2"]);
	});

	it("includes collection and its children", () => {
		const result = flattenAllEntities(nestedTimeline);
		expect(result).toHaveLength(4);
		expect(result.map((e) => e.id)).toEqual(["s1", "coll-1", "s2", "s3"]);
	});
});

describe("flattenStageEntities", () => {
	it("returns only Stage entities", () => {
		const result = flattenStageEntities(nestedTimeline);
		expect(result).toHaveLength(3);
	});
});

describe("buildEntityIndex", () => {
	it("creates a map from ID to entity", () => {
		const index = buildEntityIndex(linearTimeline);
		expect(index.get("s1")?.type).toBe("Stage");
		expect(index.get("s2")?.type).toBe("Stage");
		expect(index.size).toBe(2);
	});

	it("includes nested entities", () => {
		const index = buildEntityIndex(nestedTimeline);
		expect(index.size).toBe(4);
		expect(index.get("coll-1")?.type).toBe("Collection");
		expect(index.get("s2")?.type).toBe("Stage");
	});
});
