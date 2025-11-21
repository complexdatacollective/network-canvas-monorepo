import type { Codebook, EdgeDefinition, EgoDefinition, NodeDefinition } from "@codaco/protocol-validation";
import { flatMap } from "lodash";

const getIdsFromEntity = (entity: NodeDefinition | EdgeDefinition | EgoDefinition): string[] =>
	entity.variables ? Object.keys(entity.variables) : [];

/**
 * Extract all variable IDs from a codebook
 * @param codebook - The codebook to extract variable IDs from
 * @returns Array of variable IDs
 */
export const getIdsFromCodebook = (codebook: Codebook): string[] => {
	const result: string[] = [];

	Object.entries(codebook).forEach(([type, entityOrEntities]) => {
		if (type === "ego" && entityOrEntities && !Array.isArray(entityOrEntities)) {
			result.push(...getIdsFromEntity(entityOrEntities as EgoDefinition));
		} else if (Array.isArray(entityOrEntities) || (entityOrEntities && typeof entityOrEntities === "object")) {
			const ids = flatMap(entityOrEntities as Record<string, NodeDefinition | EdgeDefinition>, getIdsFromEntity);
			result.push(...ids);
		}
	});

	return result;
};
