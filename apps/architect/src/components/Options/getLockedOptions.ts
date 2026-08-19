import {
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOptionSetKey,
  type Variables,
} from '@codaco/protocol-validation';

/**
 * An option list rendered read-only. Widened over `VariableOptions` because an
 * interface-owned canonical set is readonly, and `LockedOptions` renders both.
 */
export type LockedOptionList = readonly {
  label: string;
  value: string | number | boolean;
}[];

/**
 * The options a variable's editors must render read-only, or undefined when
 * they may be edited.
 *
 * Two independent reasons a set is locked:
 *
 * - `interfaceOwnedOptionSet` — derived from the protocol's own stage graph
 *   (see `getInterfaceOwnedOptionMap`): an interface both writes and branches
 *   on these exact values, so the list is fixed however the variable is
 *   reached. This is the reliable signal, and the only one an authored or
 *   imported protocol carries. What is returned is then the CANONICAL set, not
 *   the variable's own list: the canonical set is what the protocol rule
 *   enforces (schema.ts refuses any other), so it is what the researcher must
 *   be shown — including when an imported protocol's list has drifted from it
 *   and the editor would otherwise present the drift as authoritative.
 * - `variable.readOnly` — stamped by Architect's own new-variable window, kept
 *   for back-compat. Absent from every authored/imported protocol, so it can
 *   never be the only check.
 *
 * The literal `type` comparison (rather than the `isOrdinalOrCategoricalType`
 * guard) narrows the discriminated union so `options` is typed as
 * `VariableOptions`.
 */
export const getLockedOptions = (
  existingVariables: Variables | undefined,
  variable: unknown,
  interfaceOwnedOptionSet?: InterfaceOwnedOptionSetKey,
): LockedOptionList | undefined => {
  if (interfaceOwnedOptionSet) {
    return INTERFACE_OWNED_OPTION_SETS[interfaceOwnedOptionSet].options;
  }

  const selectedVariable =
    typeof variable === 'string' ? existingVariables?.[variable] : undefined;

  if (
    !selectedVariable ||
    (selectedVariable.type !== 'categorical' &&
      selectedVariable.type !== 'ordinal')
  ) {
    return undefined;
  }

  return selectedVariable.readOnly ? selectedVariable.options : undefined;
};
