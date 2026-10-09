import type { EntityDefinition } from '@codaco/protocol-validation';

type Variables = NonNullable<EntityDefinition['variables']>;

/**
 * Names are compared in NFC. A researcher's variable name is stored in NFC, but
 * the header of a data file produced elsewhere (a spreadsheet exported on
 * macOS, say) may spell the same text decomposed.
 */
const findVariableIdByName = (variables: Variables, name: string) => {
  const target = name.normalize('NFC');

  return Object.entries(variables).find(
    ([, variable]) => variable.name.normalize('NFC') === target,
  )?.[0];
};

/**
 * Resolves a `<variable name>_<option value>` column to
 * `<variable id>_<option value>`, where the option value is spelled as the
 * codebook spells it.
 *
 * Both the variable name and the option value may contain underscores, so every
 * underscore is tried as the split point.
 */
const findCategoricalKey = (variables: Variables, toFind: string) => {
  for (
    let index = toFind.indexOf('_');
    index !== -1;
    index = toFind.indexOf('_', index + 1)
  ) {
    const name = toFind.slice(0, index);
    const option = toFind.slice(index + 1).normalize('NFC');

    if (!name || !option) {
      continue;
    }

    const target = name.normalize('NFC');

    for (const [id, variable] of Object.entries(variables)) {
      if (
        variable.type !== 'categorical' ||
        variable.name.normalize('NFC') !== target
      ) {
        continue;
      }

      const match = variable.options.find(
        (candidate) => String(candidate.value).normalize('NFC') === option,
      );

      if (match) {
        return `${id}_${String(match.value)}`;
      }
    }
  }

  return null;
};

/**
 * Utility function that can be used to help with translating external data
 * variable labels to UUIDs, if a match is possible.
 *
 * Assuming that {variables} contains other objects, keyed by a UUID, this function
 * first checks if the string to find is a valid key in the object, and returns it
 * if so (equivalent to codebook.node.uuid === toFind )
 *
 * if not, it iterates the keys of the object, and tests the keys of each child object
 * to see if the 'name' property equals {toFind}. This is equivalent to
 * codebook.node.uuid.name === toFind. Where this child object is found, its key within
 * the parent object is returned.
 *
 * Finally, if neither approach finds a UUID, {toFind} is returned.
 *
 * Names and option values are matched in NFC, and the keys of {variables} are
 * read only as own properties, so a name such as `__proto__` or `constructor`
 * is just a name.
 */
const getParentKeyByNameValue = (
  variables: Variables | undefined,
  toFind: string,
) => {
  // No entity definition for this type
  if (!variables || Object.keys(variables).length === 0) {
    return toFind;
  }

  // Immediate match
  if (Object.hasOwn(variables, toFind)) {
    return toFind;
  }

  const idByName = findVariableIdByName(variables, toFind);
  if (idByName !== undefined) {
    return idByName;
  }

  // possible location
  if (toFind.endsWith('_x') || toFind.endsWith('_y')) {
    const locationId = findVariableIdByName(
      variables,
      toFind.slice(0, toFind.length - 2),
    );
    if (locationId !== undefined) {
      return `${locationId}${toFind.slice(toFind.length - 2)}`;
    }
  }

  // possible categorical
  return findCategoricalKey(variables, toFind) ?? toFind;
};

export default getParentKeyByNameValue;
