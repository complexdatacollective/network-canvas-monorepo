/**
 * Values that mean "nothing has been entered here".
 *
 * Matches the form store's own reading of blank, so a field the form treats as
 * untouched is not reported as answered by the outline or counted as evidence
 * that an optional capability is switched on.
 */
export function isBlankFieldValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}
