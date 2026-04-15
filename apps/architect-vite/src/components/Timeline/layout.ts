import type { BranchEntity, CollectionEntityType, Entity, StageEntity, Timeline } from "@codaco/protocol-validation";

export type LayoutNode = {
	row: number;
	column: number;
	entityId: string;
	type: "Stage" | "Branch" | "Collection";
};

type QueueItem = {
	entityId: string;
	row: number;
	column: number;
};

function buildEntityIndex(entities: Entity[]): Map<string, Entity> {
	const index = new Map<string, Entity>();

	function indexEntity(entity: Entity) {
		index.set(entity.id, entity);
		if (entity.type === "Collection") {
			for (const child of entity.children) {
				indexEntity(child);
			}
		}
	}

	for (const entity of entities) {
		indexEntity(entity);
	}

	return index;
}

function resolveCollectionEntry(entity: Entity, index: Map<string, Entity>): Entity {
	if (entity.type !== "Collection") {
		return entity;
	}
	const first = entity.children[0];
	if (!first) {
		return entity;
	}
	return resolveCollectionEntry(index.get(first.id) ?? first, index);
}

function getSuccessors(entity: Entity, index: Map<string, Entity>): Array<{ entityId: string; slotIndex: number }> {
	if (entity.type === "Stage") {
		const stage = entity as StageEntity;
		if ("target" in stage && typeof stage.target === "string") {
			const target = index.get(stage.target);
			if (target) {
				const resolved = resolveCollectionEntry(target, index);
				return [{ entityId: resolved.id, slotIndex: 0 }];
			}
		}
		return [];
	}

	if (entity.type === "Branch") {
		const branch = entity as BranchEntity;
		return branch.slots.map((slot, i) => {
			const target = index.get(slot.target);
			if (target) {
				const resolved = resolveCollectionEntry(target, index);
				return { entityId: resolved.id, slotIndex: i };
			}
			return { entityId: slot.target, slotIndex: i };
		});
	}

	if (entity.type === "Collection") {
		const collection = entity as CollectionEntityType;
		const last = collection.children[collection.children.length - 1];
		if (last) {
			return getSuccessors(index.get(last.id) ?? last, index);
		}
	}

	return [];
}

export function computeLayout(timeline: Timeline): Map<string, LayoutNode> {
	const result = new Map<string, LayoutNode>();

	if (timeline.entities.length === 0) {
		return result;
	}

	const index = buildEntityIndex(timeline.entities);

	const startEntity = index.get(timeline.start);
	if (!startEntity) {
		return result;
	}

	const resolved = resolveCollectionEntry(startEntity, index);
	const queue: QueueItem[] = [{ entityId: resolved.id, row: 0, column: 0 }];

	while (queue.length > 0) {
		const item = queue.shift();
		if (item === undefined) {
			break;
		}
		const { entityId, row, column } = item;

		const existing = result.get(entityId);
		if (existing !== undefined) {
			if (row <= existing.row) {
				continue;
			}
			existing.row = row;
		} else {
			const entity = index.get(entityId);
			if (!entity) {
				continue;
			}
			result.set(entityId, {
				row,
				column,
				entityId,
				type: entity.type,
			});
		}

		const entity = index.get(entityId);
		if (!entity) {
			continue;
		}

		const successors = getSuccessors(entity, index);
		const isBranch = entity.type === "Branch";

		for (const successor of successors) {
			const nextRow = row + 1;
			const nextColumn = isBranch ? successor.slotIndex : column;
			queue.push({ entityId: successor.entityId, row: nextRow, column: nextColumn });
		}
	}

	return result;
}
