import type { VariableOptions, Variables } from '@codaco/protocol-validation';

/**
 * A read-only variable's options are owned by an interface and cannot be edited
 * in the field/attribute editors; return them so callers can render them
 * read-only. Returns undefined when the selected variable is not a read-only
 * categorical/ordinal variable. The literal `type` comparison (rather than the
 * `isOrdinalOrCategoricalType` guard) narrows the discriminated union so
 * `options` is typed as `VariableOptions`.
 */
export const getLockedOptions = (
  existingVariables: Variables | undefined,
  variable: unknown,
): VariableOptions | undefined => {
  const selectedVariable =
    typeof variable === 'string' ? existingVariables?.[variable] : undefined;

  return selectedVariable?.readOnly &&
    (selectedVariable.type === 'categorical' ||
      selectedVariable.type === 'ordinal')
    ? selectedVariable.options
    : undefined;
};
