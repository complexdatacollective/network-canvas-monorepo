import type { VariableOptions, Variables } from '@codaco/protocol-validation';

/**
 * The options a variable's editors must render read-only, or undefined when
 * they may be edited.
 *
 * Two independent reasons a set is locked:
 *
 * - `isInterfaceOwned` — derived from the protocol's own stage graph (see
 *   `getInterfaceOwnedOptionMap`): an interface both writes and branches on
 *   these exact values, so the list is fixed however the variable is reached.
 *   This is the reliable signal, and the only one an authored or imported
 *   protocol carries.
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
  isInterfaceOwned = false,
): VariableOptions | undefined => {
  const selectedVariable =
    typeof variable === 'string' ? existingVariables?.[variable] : undefined;

  if (
    !selectedVariable ||
    (selectedVariable.type !== 'categorical' &&
      selectedVariable.type !== 'ordinal')
  ) {
    return undefined;
  }

  return isInterfaceOwned || selectedVariable.readOnly
    ? selectedVariable.options
    : undefined;
};
