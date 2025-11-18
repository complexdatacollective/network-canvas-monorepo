import type { Codebook, EdgeDefinition, EgoDefinition, NodeDefinition } from "@codaco/protocol-validation";
import { flatMap } from "lodash";

const getIdsFromEntity = (entity: NodeDefinition | EdgeDefinition | EgoDefinition): string[] =>
	entity.variables ? Object.keys(entity.variables) : [];

/**
 * Extract all variable IDs from a codebook
 * @param codebook - The codebook to extract variable IDs from
 * @returns Array of variable IDs
 */
export const getIdsFromCodebook = (codebook: Codebook): string[] =>
	flatMap(
		codebook,
		(
			entityOrEntities:
				| NodeDefinition
				| EdgeDefinition
				| EgoDefinition
				| Record<string, NodeDefinition | EdgeDefinition>,
			type: string,
		) =>
			type === "ego"
				? getIdsFromEntity(entityOrEntities as EgoDefinition)
				: flatMap(entityOrEntities as Record<string, NodeDefinition | EdgeDefinition>, getIdsFromEntity),
	);
