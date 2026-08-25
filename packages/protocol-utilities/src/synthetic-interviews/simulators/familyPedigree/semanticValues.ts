import type { VariableValue } from '@codaco/shared-consts';

/** Store a pedigree option in the shape required by its codebook variable. */
export function storedPedigreeOptionValue(
  variable: { type: string } | undefined,
  value: string,
): VariableValue {
  return variable?.type === 'categorical' ? [value] : value;
}

/** Read either the categorical array or ordinal scalar representation. */
export function readPedigreeOptionValue(
  value: VariableValue | undefined,
): string | undefined {
  const candidate = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : undefined
    : value;
  return typeof candidate === 'string' ? candidate : undefined;
}
