import type { Codebook, EntityDefinition } from '@codaco/protocol-validation';

import { asOptionName } from './optionName';

type Variables = NonNullable<EntityDefinition['variables']>;
type Layouts = NonNullable<Codebook['layouts']>;

/**
 * Names are compared in NFC. A researcher's variable name is stored in NFC, but
 * the header of a data file produced elsewhere (a spreadsheet exported on
 * macOS, say) may spell the same text decomposed.
 */
const findVariableIdByName = (
  variables: Readonly<Record<string, { name: string }>>,
  name: string,
) => {
  const target = name.normalize('NFC');

  return Object.entries(variables).find(
    ([, variable]) => variable.name.normalize('NFC') === target,
  )?.[0];
};

/**
 * Resolves a `<variable name>_<option value>` column to
 * `<variable id>_<option value>`, where the option value is spelled as the
 * codebook spells it. An option is matched in NFC, and then as an option name,
 * so a column still spelling the text an option was renamed from by the
 * schema 9 migration (`"Yes "` for `"Yes"`) still finds it.
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

      const asName = asOptionName(option);
      const match =
        variable.options.find(
          (candidate) => String(candidate.value).normalize('NFC') === option,
        ) ??
        variable.options.find(
          (candidate) => String(candidate.value) === asName,
        );

      if (match) {
        return `${id}_${String(match.value)}`;
      }
    }
  }

  return null;
};

const findLayoutKey = (layouts: Layouts | undefined, toFind: string) => {
  if (!layouts || !(toFind.endsWith('_x') || toFind.endsWith('_y'))) {
    return undefined;
  }
  const layoutId = findVariableIdByName(layouts, toFind.slice(0, -2));
  return layoutId === undefined ? undefined : `${layoutId}${toFind.slice(-2)}`;
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
 * A `<layout name>_x` or `<layout name>_y` column, as an export writes a
 * position, resolves to `<layout id>_x` or `<layout id>_y` against {layouts}
 * only: a variable is never a layout.
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
  layouts?: Layouts,
) => {
  const layoutKey = findLayoutKey(layouts, toFind);

  // No entity definition for this type
  if (!variables || Object.keys(variables).length === 0) {
    return layoutKey ?? toFind;
  }

  // Immediate match
  if (Object.hasOwn(variables, toFind)) {
    return toFind;
  }

  const idByName = findVariableIdByName(variables, toFind);
  if (idByName !== undefined) {
    return idByName;
  }

  if (layoutKey !== undefined) {
    return layoutKey;
  }

  // possible categorical
  return findCategoricalKey(variables, toFind) ?? toFind;
};

export default getParentKeyByNameValue;
