import type { BranchEntity } from "../timeline/branch";
import type { Entity } from "../timeline/entity";
import type { Timeline } from "../timeline/timeline";
import { buildEntityIndex, flattenAllEntities } from "./flatten";

export function validateIdUniqueness(entities: Entity[]): string[] {
	const errors: string[] = [];
	const seen = new Set<string>();

	for (const entity of flattenAllEntities(entities)) {
		if (seen.has(entity.id)) {
			errors.push(`Duplicate entity ID "${entity.id}"`);
		}
		seen.add(entity.id);

		if (entity.type === "Branch") {
			for (const slot of (entity as BranchEntity).slots) {
				if (seen.has(slot.id)) {
					errors.push(`Duplicate slot ID "${slot.id}"`);
				}
				seen.add(slot.id);
			}
		}
	}

	return errors;
}

export function validateTargetReferences(entities: Entity[]): string[] {
	const errors: string[] = [];
	const index = buildEntityIndex(entities);

	for (const entity of flattenAllEntities(entities)) {
		if (entity.type === "Stage" && "target" in entity && entity.target) {
			if (entity.target === entity.id) {
				errors.push(`Entity "${entity.id}" has a self-referencing target`);
			} else if (!index.has(entity.target)) {
				errors.push(`Entity "${entity.id}" references nonexistent target "${entity.target}"`);
			}
		}

		if (entity.type === "Branch") {
			for (const slot of (entity as BranchEntity).slots) {
				if (slot.target === entity.id) {
					errors.push(`Branch "${entity.id}" slot "${slot.id}" targets its own branch`);
				} else if (!index.has(slot.target)) {
					errors.push(`Branch "${entity.id}" slot "${slot.id}" references nonexistent target "${slot.target}"`);
				}
			}
		}
	}

	return errors;
}

export function validateStartReference(timeline: Timeline): string[] {
	const errors: string[] = [];
	const topLevelIds = new Set(timeline.entities.map((e) => e.id));

	if (!topLevelIds.has(timeline.start)) {
		errors.push(`Start references nonexistent entity "${timeline.start}"`);
	}

	return errors;
}
