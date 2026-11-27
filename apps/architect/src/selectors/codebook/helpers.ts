import type {
  Codebook,
  EdgeDefinition,
  EgoDefinition,
  NodeDefinition,
} from '@codaco/protocol-validation';

const getIdsFromEntity = (
  entity: NodeDefinition | EdgeDefinition | EgoDefinition,
): string[] => (entity.variables ? Object.keys(entity.variables) : []);

/**
 * Extract all variable IDs from a codebook
 * @param codebook - The codebook to extract variable IDs from
 * @returns Array of variable IDs
 */
export const getIdsFromCodebook = (codebook: Codebook): string[] => [
  ...Object.values(codebook.node ?? {}).flatMap(getIdsFromEntity),
  ...Object.values(codebook.edge ?? {}).flatMap(getIdsFromEntity),
  ...(codebook.ego ? getIdsFromEntity(codebook.ego) : []),
];
