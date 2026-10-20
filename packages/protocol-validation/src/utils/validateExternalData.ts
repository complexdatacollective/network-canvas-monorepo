import {
  CodebookNameSchema,
  entityAttributesProperty,
  type NcEntity,
  toCanonicalText,
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

/**
 * Whether an external network's column or attribute name is one an interview
 * can match to a variable.
 *
 * The interview pairs a column with the variable of the same name, compared in
 * NFC and otherwise exactly as written (`getParentKeyByNameValue`). So a name
 * follows the codebook's own name rule once it is in NFC: a heading a macOS
 * export spelled decomposed still reaches its variable and is accepted, while
 * one with a space at either end is refused rather than trimmed, because no
 * variable can be named that way and the column's values would never reach
 * one.
 */
export const isUsableExternalAttributeName = (name: string) =>
  CodebookNameSchema.safeParse(toCanonicalText(name)).success;

/**
 * Groups of attribute names that are different strings but the same name once
 * in NFC, each group holding the names exactly as written.
 *
 * The interview would pair every name in a group with one variable and keep
 * only one column's values, so a network carrying such a group is refused.
 * Names that differ only in case are not grouped: the interview matches them
 * case-sensitively, so each reaches its own variable.
 */
export const findCollidingAttributeNames = (
  names: readonly string[],
): string[][] => {
  const groups = new Map<string, Set<string>>();
  for (const name of names) {
    const canonical = toCanonicalText(name);
    const group = groups.get(canonical) ?? new Set<string>();
    group.add(name);
    groups.set(canonical, group);
  }

  return Array.from(groups.values())
    .filter((group) => group.size > 1)
    .map((group) => Array.from(group));
};

export const validateNames = (items: string[] = []) => {
  const errors = items.filter((item) => !isUsableExternalAttributeName(item));
  const collisions = findCollidingAttributeNames(items);

  if (errors.length === 0 && collisions.length === 0) {
    return false;
  }

  const unusable =
    errors.length === 0
      ? []
      : [
          `Attribute name not allowed (${errors.map((error) => JSON.stringify(error)).join(', ')}). Names must not be empty, start or end with a space, or contain control characters.`,
        ];
  const duplicated =
    collisions.length === 0
      ? []
      : [
          `Attribute names that are the same name written in different ways (${collisions.map((group) => group.map((name) => JSON.stringify(name)).join(' and ')).join(', ')}). Rename or remove all but one of each.`,
        ];

  return [...unusable, ...duplicated].join(' ');
};
