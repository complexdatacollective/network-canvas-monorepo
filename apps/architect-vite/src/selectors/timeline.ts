import type { CollectionEntityType, Entity, StageEntity, Timeline } from "@codaco/protocol-validation";
import { createSelector } from "@reduxjs/toolkit";
import { getProtocol } from "./protocol";

export const getTimeline = createSelector(getProtocol, (protocol): Timeline | null => protocol?.timeline ?? null);

export const getTimelineEntities = createSelector(getTimeline, (timeline): Entity[] => timeline?.entities ?? []);

export const getTimelineStart = createSelector(getTimeline, (timeline): string | null => timeline?.start ?? null);

function flattenStageEntitiesFromList(entities: Entity[]): StageEntity[] {
	const result: StageEntity[] = [];
	for (const entity of entities) {
		if (entity.type === "Stage") {
			result.push(entity);
		} else if (entity.type === "Collection") {
			result.push(...flattenStageEntitiesFromList((entity as CollectionEntityType).children));
		}
	}
	return result;
}

function findEntityInList(entities: Entity[], id: string): Entity | undefined {
	for (const entity of entities) {
		if (entity.id === id) return entity;
		if (entity.type === "Collection") {
			const found = findEntityInList((entity as CollectionEntityType).children, id);
			if (found) return found;
		}
	}
	return undefined;
}

export const getEntityList = createSelector(getTimelineEntities, (entities): StageEntity[] =>
	flattenStageEntitiesFromList(entities),
);

export const getEntity = (entities: Entity[], id: string): Entity | undefined => findEntityInList(entities, id);
