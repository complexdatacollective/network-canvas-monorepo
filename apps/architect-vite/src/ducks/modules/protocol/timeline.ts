import type { Entity, Timeline } from "@codaco/protocol-validation";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type InsertEntityPayload = {
	entity: Entity;
	afterEntityId: string;
};

type UpdateEntityPayload = {
	entityId: string;
	updates: Partial<Entity>;
};

type MoveEntityPayload = {
	entityId: string;
	afterEntityId: string | null;
};

type ReorderBranchSlotsPayload = {
	branchId: string;
	slotIds: string[];
};

const initialState: Timeline = {
	start: "",
	entities: [] as Entity[],
};

function getEntityTarget(entity: Entity): string | undefined {
	if (entity.type === "Stage" && "target" in entity) {
		return entity.target;
	}
	return undefined;
}

function setEntityTarget(entity: Entity, target: string | undefined): void {
	if (entity.type === "Stage") {
		if (target === undefined) {
			delete (entity as Record<string, unknown>).target;
		} else {
			(entity as Record<string, unknown>).target = target;
		}
	}
}

/**
 * Finds the entity in the top-level entities array whose target points to the given id,
 * and returns it. For branches, this searches slot targets.
 * Only searches top-level entities (not recursing into collections for parent lookup).
 */
function findParentEntity(entities: Entity[], targetId: string): Entity | undefined {
	for (const entity of entities) {
		if (entity.type === "Stage" && "target" in entity && entity.target === targetId) {
			return entity;
		}
		if (entity.type === "Collection") {
			const found = findParentEntity(entity.children, targetId);
			if (found) return found;
		}
	}
	return undefined;
}

function findEntityById(entities: Entity[], id: string): Entity | undefined {
	for (const entity of entities) {
		if (entity.id === id) return entity;
		if (entity.type === "Collection") {
			const found = findEntityById(entity.children, id);
			if (found) return found;
		}
	}
	return undefined;
}

function removeEntityById(entities: Entity[], id: string): boolean {
	const index = entities.findIndex((e) => e.id === id);
	if (index !== -1) {
		entities.splice(index, 1);
		return true;
	}
	for (const entity of entities) {
		if (entity.type === "Collection") {
			if (removeEntityById(entity.children, id)) return true;
		}
	}
	return false;
}

function insertEntityAfter(entities: Entity[], afterId: string, newEntity: Entity): boolean {
	const index = entities.findIndex((e) => e.id === afterId);
	if (index !== -1) {
		entities.splice(index + 1, 0, newEntity);
		return true;
	}
	for (const entity of entities) {
		if (entity.type === "Collection") {
			if (insertEntityAfter(entity.children, afterId, newEntity)) return true;
		}
	}
	return false;
}

const timelineSlice = createSlice({
	name: "timeline",
	initialState,
	reducers: {
		setTimeline: (_state, action: PayloadAction<Timeline>) => {
			return action.payload;
		},

		insertEntity: (state, action: PayloadAction<InsertEntityPayload>) => {
			const { entity: newEntity, afterEntityId } = action.payload;
			const afterEntity = findEntityById(state.entities, afterEntityId);
			if (!afterEntity) return;

			const previousTarget = getEntityTarget(afterEntity);

			setEntityTarget(afterEntity, newEntity.id);

			if (previousTarget !== undefined) {
				setEntityTarget(newEntity, previousTarget);
			}

			insertEntityAfter(state.entities, afterEntityId, newEntity);
		},

		deleteEntity: (state, action: PayloadAction<string>) => {
			const entityId = action.payload;
			const entity = findEntityById(state.entities, entityId);
			if (!entity) return;

			const entityTarget = getEntityTarget(entity);

			if (state.start === entityId && entityTarget) {
				state.start = entityTarget;
			}

			const parent = findParentEntity(state.entities, entityId);
			if (parent) {
				setEntityTarget(parent, entityTarget);
			}

			removeEntityById(state.entities, entityId);
		},

		updateEntity: (state, action: PayloadAction<UpdateEntityPayload>) => {
			const { entityId, updates } = action.payload;
			const entity = findEntityById(state.entities, entityId);
			if (!entity) return;

			Object.assign(entity, updates, { id: entityId });
		},

		reorderBranchSlots: (state, action: PayloadAction<ReorderBranchSlotsPayload>) => {
			const { branchId, slotIds } = action.payload;
			const entity = findEntityById(state.entities, branchId);
			if (!entity || entity.type !== "Branch") return;

			const slotMap = new Map(entity.slots.map((s) => [s.id, s]));
			const reordered = slotIds.map((id) => slotMap.get(id)).filter((s) => s !== undefined);

			if (reordered.length === entity.slots.length) {
				entity.slots = reordered;
			}
		},

		moveEntity: (state, action: PayloadAction<MoveEntityPayload>) => {
			const { entityId, afterEntityId } = action.payload;
			const entity = findEntityById(state.entities, entityId);
			if (!entity) return;

			const entityTarget = getEntityTarget(entity);

			// Rewire parent of entity being moved
			if (state.start === entityId && entityTarget) {
				state.start = entityTarget;
			}
			const oldParent = findParentEntity(state.entities, entityId);
			if (oldParent) {
				setEntityTarget(oldParent, entityTarget);
			}

			// Remove from current position
			removeEntityById(state.entities, entityId);

			if (afterEntityId === null) {
				// Insert at the start of the top-level entities list
				const firstEntity = state.entities[0];
				if (firstEntity) {
					setEntityTarget(entity, firstEntity.id);
				}
				state.start = entityId;
				state.entities.unshift(entity);
				return;
			}

			// Insert at new position and rewire targets
			const newParent = findEntityById(state.entities, afterEntityId);
			if (!newParent) return;

			const newParentOldTarget = getEntityTarget(newParent);
			setEntityTarget(newParent, entityId);
			setEntityTarget(entity, newParentOldTarget);

			insertEntityAfter(state.entities, afterEntityId, entity);
		},
	},
});

export const timelineSliceActions = timelineSlice.actions;

export default timelineSlice.reducer;
