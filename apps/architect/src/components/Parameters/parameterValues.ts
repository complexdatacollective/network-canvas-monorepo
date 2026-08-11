/**
 * A variable's `parameters` block as it exists mid-edit. Every reader here is
 * defensive: the block is authored by hand in the editor and may hold anything
 * until it is committed and validated.
 */
export type ParameterValues = Record<string, unknown>;

export const asParameterValues = (
  value: unknown,
): ParameterValues | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ParameterValues)
    : undefined;

/** A parameter as a `Field` `initialValue`, or undefined when it is not text. */
export const parameterString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * A day-offset parameter as a `Field` `initialValue`. Stored as a number, so a
 * legacy string is coerced rather than rendered into a number input verbatim.
 */
export const parameterInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
};
