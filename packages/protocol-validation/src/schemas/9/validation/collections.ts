import type { BranchSlot } from "../timeline/branch";
import type { CollectionEntityType, Entity } from "../timeline/entity";
import { flattenAllEntities } from "./flatten";

function getTargetsForEntity(entity: Entity): string[] {
	if (entity.type === "Stage" && "target" in entity && entity.target) {
		return [entity.target];
	}
	if (entity.type === "Branch") {
		return (entity as { slots: BranchSlot[] }).slots.map((s) => s.target);
	}
	return [];
}

export function validateCollectionConstraints(topLevelEntities: Entity[]): string[] {
	const errors: string[] = [];

	function checkCollection(collection: CollectionEntityType) {
		const children = collection.children;
		const siblingIds = new Set(children.map((c) => c.id));
		const lastChild = children.at(-1);

		if (lastChild?.type === "Branch") {
			errors.push(
				`Collection "${collection.id}" has a Branch ("${lastChild.id}") as its last child, which would create multiple exits`,
			);
		}

		for (let i = 0; i < children.length - 1; i++) {
			const child = children[i];
			if (!child) continue;
			const targets = getTargetsForEntity(child);
			for (const targetId of targets) {
				if (!siblingIds.has(targetId)) {
					errors.push(
						`Non-last child "${child.id}" in collection "${collection.id}" targets "${targetId}" outside the collection`,
					);
				}
			}
		}

		if (children.length > 1) {
			const firstChild = children[0];
			const firstChildId = firstChild?.id;
			if (firstChildId) {
				for (let i = 1; i < children.length; i++) {
					const sibling = children[i];
					if (!sibling) continue;
					const targets = getTargetsForEntity(sibling);
					if (targets.includes(firstChildId)) {
						errors.push(
							`Sibling "${sibling.id}" targets first child "${firstChildId}" in collection "${collection.id}"`,
						);
					}
				}
			}
		}

		for (const child of children) {
			if (child.type === "Collection") {
				checkCollection(child as CollectionEntityType);
			}
		}
	}

	for (const entity of flattenAllEntities(topLevelEntities)) {
		if (entity.type === "Collection") {
			checkCollection(entity as CollectionEntityType);
		}
	}

	return errors;
}
