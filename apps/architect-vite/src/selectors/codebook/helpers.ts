import { flatMap } from "lodash";
import type { 
	Codebook,
	NodeDefinition,
	EdgeDefinition,
	EgoDefinition
} from "@codaco/protocol-validation";

const getIdsFromEntity = (entity: NodeDefinition | EdgeDefinition | EgoDefinition): string[] => 
	(entity.variables ? Object.keys(entity.variables) : []);

/**
 * Extract all variable IDs from a codebook
 * @param codebook - The codebook to extract variable IDs from
 * @returns Array of variable IDs
 */
export const getIdsFromCodebook = (codebook: Codebook): string[] =>
	flatMap(codebook, (entityOrEntities: NodeDefinition | EdgeDefinition | EgoDefinition | Record<string, NodeDefinition | EdgeDefinition>, type: string) =>
		type === "ego" ? getIdsFromEntity(entityOrEntities as EgoDefinition) : flatMap(entityOrEntities as Record<string, NodeDefinition | EdgeDefinition>, getIdsFromEntity),
	);