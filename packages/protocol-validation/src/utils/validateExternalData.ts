// An external network's column names become attribute names, so they follow
// the same rule as the names a researcher types into the codebook.

import {
  CodebookNameSchema,
  entityAttributesProperty,
  type NcEntity,
} from '@codaco/shared-consts';

// External data types - represent imported data before conversion to full NcNetwork format
// These reference the shared types but allow for the simpler structure of external data
type Item = Pick<NcEntity, typeof entityAttributesProperty>;
export type Network = {
  nodes: Item[];
  edges: Item[];
};

const getUniqueAttributes = (items: Item[]) => {
  const uniqueSet = items.reduce<Set<string>>((acc, node) => {
    for (const key of Object.keys(node[entityAttributesProperty])) {
      acc.add(key);
    }
    return acc;
  }, new Set([]));

  return Array.from(uniqueSet);
};

export const getVariableNamesFromNetwork = (network: Network) =>
  (['nodes', 'edges'] as const).flatMap((entity) =>
    getUniqueAttributes(network[entity] || []),
  );

export const validateNames = (items: string[] = []) => {
  const errors = items.filter(
    (item) => !CodebookNameSchema.safeParse(item).success,
  );

  if (errors.length === 0) {
    return false;
  }

  return `Attribute name not allowed (${errors.map((error) => JSON.stringify(error)).join(', ')}). Names must not be empty, start or end with a space, or contain control characters.`;
};
