import { describe, expect, it } from "vitest";
import type { Entity } from "../timeline/entity";
import type { Timeline } from "../timeline/timeline";
import { buildEntityIndex, flattenAllEntities, flattenStageEntities } from "../validation/flatten";
import { validateAllPathsTerminate, validateNoCycles, validateNoOrphans } from "../validation/graph";
import { validateIdUniqueness, validateStartReference, validateTargetReferences } from "../validation/references";

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

describe("validateIdUniqueness", () => {
	it("passes with unique IDs", () => {
		const errors = validateIdUniqueness(linearTimeline);
		expect(errors).toHaveLength(0);
	});

	it("detects duplicate IDs", () => {
		const duped: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s1", items: [] } as Entity,
			{ id: "s1", type: "Stage", stageType: "FinishInterview", label: "B" } as Entity,
		];
		const errors = validateIdUniqueness(duped);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("s1");
	});
});

describe("validateTargetReferences", () => {
	it("passes with valid targets", () => {
		const errors = validateTargetReferences(linearTimeline);
		expect(errors).toHaveLength(0);
	});

	it("detects invalid target reference", () => {
		const bad: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "nonexistent", items: [] } as Entity,
		];
		const errors = validateTargetReferences(bad);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("detects self-referencing target", () => {
		const selfRef: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s1", items: [] } as Entity,
		];
		const errors = validateTargetReferences(selfRef);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateStartReference", () => {
	it("passes when start references a valid entity", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateStartReference(timeline);
		expect(errors).toHaveLength(0);
	});

	it("fails when start references nonexistent entity", () => {
		const timeline: Timeline = { start: "nope", entities: linearTimeline };
		const errors = validateStartReference(timeline);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateNoCycles", () => {
	it("passes for a DAG", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateNoCycles(timeline);
		expect(errors).toHaveLength(0);
	});

	it("detects a cycle", () => {
		const cyclic: Entity[] = [
			{ id: "s1", type: "Stage", stageType: "Information", label: "A", target: "s2", items: [] } as Entity,
			{ id: "s2", type: "Stage", stageType: "Information", label: "B", target: "s1", items: [] } as Entity,
		];
		const timeline: Timeline = { start: "s1", entities: cyclic };
		const errors = validateNoCycles(timeline);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateAllPathsTerminate", () => {
	it("passes when all paths reach FinishInterview", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateAllPathsTerminate(timeline);
		expect(errors).toHaveLength(0);
	});

	it("fails when a path has no FinishInterview", () => {
		const noFinish: Entity[] = [{ id: "s1", type: "Stage", stageType: "Information", label: "A", items: [] } as Entity];
		const timeline: Timeline = { start: "s1", entities: noFinish };
		const errors = validateAllPathsTerminate(timeline);
		expect(errors.length).toBeGreaterThan(0);
	});
});

describe("validateNoOrphans", () => {
	it("passes when all entities are reachable", () => {
		const timeline: Timeline = { start: "s1", entities: linearTimeline };
		const errors = validateNoOrphans(timeline);
		expect(errors).toHaveLength(0);
	});

	it("detects unreachable entities", () => {
		const withOrphan: Entity[] = [
			...linearTimeline,
			{ id: "orphan", type: "Stage", stageType: "Information", label: "Lost", items: [] } as Entity,
		];
		const timeline: Timeline = { start: "s1", entities: withOrphan };
		const errors = validateNoOrphans(timeline);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("orphan");
	});
});
