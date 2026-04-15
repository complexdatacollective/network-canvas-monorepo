import type { StageEntity } from "../stages";
import type { CollectionEntityType, Entity } from "../timeline/entity";

export function flattenAllEntities(entities: Entity[]): Entity[] {
	const result: Entity[] = [];
	for (const entity of entities) {
		result.push(entity);
		if (entity.type === "Collection") {
			result.push(...flattenAllEntities((entity as CollectionEntityType).children));
		}
	}
	return result;
}

export function flattenStageEntities(entities: Entity[]): StageEntity[] {
	return flattenAllEntities(entities).filter((e): e is StageEntity => e.type === "Stage");
}

export function buildEntityIndex(entities: Entity[]): Map<string, Entity> {
	const index = new Map<string, Entity>();
	for (const entity of flattenAllEntities(entities)) {
		index.set(entity.id, entity);
	}
	return index;
}
