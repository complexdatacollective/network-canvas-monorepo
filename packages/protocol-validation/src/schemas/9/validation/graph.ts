import type { BranchEntity } from "../timeline/branch";
import type { CollectionEntityType, Entity } from "../timeline/entity";
import type { Timeline } from "../timeline/timeline";
import { buildEntityIndex, flattenAllEntities } from "./flatten";

function getSuccessors(entity: Entity): string[] {
	if (entity.type === "Stage") {
		if (entity.stageType === "FinishInterview") {
			return [];
		}
		if (entity.target) {
			return [entity.target];
		}
		return [];
	}

	if (entity.type === "Branch") {
		return (entity as BranchEntity).slots.map((slot) => slot.target);
	}

	if (entity.type === "Collection") {
		const children = (entity as CollectionEntityType).children;
		if (children.length > 0) {
			return [children[0].id];
		}
		return [];
	}

	return [];
}

function resolveTarget(targetId: string, index: Map<string, Entity>): string {
	const entity = index.get(targetId);
	if (entity?.type === "Collection") {
		const children = (entity as CollectionEntityType).children;
		if (children.length > 0) {
			return children[0].id;
		}
	}
	return targetId;
}

export function validateNoCycles(timeline: Timeline): string[] {
	const errors: string[] = [];
	const index = buildEntityIndex(timeline.entities);

	const visited = new Set<string>();
	const visiting = new Set<string>();

	function dfs(entityId: string): boolean {
		if (visiting.has(entityId)) {
			errors.push(`Cycle detected involving entity "${entityId}"`);
			return true;
		}
		if (visited.has(entityId)) {
			return false;
		}

		const entity = index.get(entityId);
		if (!entity) {
			return false;
		}

		visiting.add(entityId);

		const successors = getSuccessors(entity);
		for (const successorId of successors) {
			const resolvedId = resolveTarget(successorId, index);
			if (dfs(resolvedId)) {
				return true;
			}
		}

		visiting.delete(entityId);
		visited.add(entityId);
		return false;
	}

	const startEntity = index.get(timeline.start);
	if (startEntity) {
		const resolvedStart =
			startEntity.type === "Collection" && (startEntity as CollectionEntityType).children.length > 0
				? (startEntity as CollectionEntityType).children[0].id
				: timeline.start;
		dfs(resolvedStart);
	}

	return errors;
}

export function validateAllPathsTerminate(timeline: Timeline): string[] {
	const errors: string[] = [];
	const index = buildEntityIndex(timeline.entities);

	const terminates = new Map<string, boolean>();

	function checkTermination(entityId: string, path: Set<string>): boolean {
		const cached = terminates.get(entityId);
		if (cached !== undefined) {
			return cached;
		}

		if (path.has(entityId)) {
			return false;
		}

		const entity = index.get(entityId);
		if (!entity) {
			return false;
		}

		if (entity.type === "Stage" && entity.stageType === "FinishInterview") {
			terminates.set(entityId, true);
			return true;
		}

		path.add(entityId);

		const successors = getSuccessors(entity);
		if (successors.length === 0) {
			terminates.set(entityId, false);
			return false;
		}

		let allTerminate = true;
		for (const successorId of successors) {
			const resolvedId = resolveTarget(successorId, index);
			if (!checkTermination(resolvedId, new Set(path))) {
				allTerminate = false;
			}
		}

		terminates.set(entityId, allTerminate);
		return allTerminate;
	}

	const startEntity = index.get(timeline.start);
	if (startEntity) {
		const resolvedStart =
			startEntity.type === "Collection" && (startEntity as CollectionEntityType).children.length > 0
				? (startEntity as CollectionEntityType).children[0].id
				: timeline.start;
		if (!checkTermination(resolvedStart, new Set())) {
			errors.push("Not all paths from start reach a FinishInterview stage");
		}
	}

	return errors;
}

export function validateNoOrphans(timeline: Timeline): string[] {
	const errors: string[] = [];
	const index = buildEntityIndex(timeline.entities);
	const allEntities = flattenAllEntities(timeline.entities);
	const reachable = new Set<string>();

	function walk(entityId: string) {
		if (reachable.has(entityId)) {
			return;
		}

		const entity = index.get(entityId);
		if (!entity) {
			return;
		}

		reachable.add(entityId);

		if (entity.type === "Collection") {
			for (const child of (entity as CollectionEntityType).children) {
				walk(child.id);
			}
		}

		const successors = getSuccessors(entity);
		for (const successorId of successors) {
			const targetEntity = index.get(successorId);
			if (targetEntity) {
				reachable.add(successorId);
				if (targetEntity.type === "Collection") {
					walk(successorId);
				} else {
					walk(successorId);
				}
			}
		}
	}

	walk(timeline.start);

	for (const entity of allEntities) {
		if (!reachable.has(entity.id)) {
			errors.push(`Entity "${entity.id}" is not reachable from start`);
		}
	}

	return errors;
}
