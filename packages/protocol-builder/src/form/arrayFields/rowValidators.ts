import { get, isEqual, isNil } from 'es-toolkit/compat';

import { normalizeForComparison } from '@codaco/shared-consts';

/**
 * A rule a row cell runs for itself.
 *
 * The shape is deliberately narrower than the host's own rule registry: a row
 * cell is not a registered field (see `RowField`), so nothing here can consult
 * the form store, and the only context a cross-row rule legitimately needs is
 * the array it belongs to. Rules arrive as FUNCTIONS rather than as a
 * configuration object keyed by rule name, because a package cannot own the
 * host's registry and a name it does not know would have to fail at runtime
 * with "validation not found" — a message no researcher can act on.
 */
export type RowValidator = (
  value: unknown,
  /** The whole array, scoped under its own field name (`arrayScopedValues`). */
  allValues: Record<string, unknown> | undefined,
  /** Resolved path of the cell, e.g. `options[0].label`. */
  name: string,
) => string | undefined;

const hasValue = (value: unknown) =>
  typeof value === 'string' ? value !== '' : !isNil(value);

/**
 * Case-insensitive AND Unicode-canonical: a precomposed and a decomposed
 * spelling of the same text are the same answer, so they are the same value
 * here too. See `@codaco/shared-consts`' `canonical-text`.
 */
const isRoughlyEqual = (left: unknown, right: unknown) =>
  typeof left === 'string' && typeof right === 'string'
    ? normalizeForComparison(left) === normalizeForComparison(right)
    : isEqual(left, right);

const capitalize = (word: string) =>
  word.replace(/^\w/, (firstLetter) => firstLetter.toUpperCase());

/** Nothing entered. `false` and `0` are answers; `''` and absent are not. */
export const requiredRow =
  (message = 'Required'): RowValidator =>
  (value) =>
    hasValue(value) ? undefined : message;

/**
 * No other row of the same array may hold this value in the same column.
 *
 * Reads the cell's own resolved name (`options[3].label`) to find both the
 * array and the column, exactly as the host rule it replaces does, so a row
 * bound to the wrong index cannot silently compare itself against a different
 * column.
 */
export const uniqueRowAttribute =
  (message?: string): RowValidator =>
  (value, allValues, name) => {
    if (!value) return undefined;

    const fieldMatch = /^(.*)\[\d+\]\.([^.[\]]+)$/.exec(name);
    if (!fieldMatch) return undefined;

    const [, arrayName = '', attribute = ''] = fieldMatch;
    const rows: unknown = get(allValues, arrayName);
    if (!Array.isArray(rows)) return undefined;

    const matches = rows.filter(
      (row: unknown) =>
        typeof row === 'object' &&
        row !== null &&
        isRoughlyEqual(Reflect.get(row, attribute), value),
    ).length;

    return matches >= 2
      ? (message ?? `${capitalize(attribute)}s must be unique`)
      : undefined;
  };

/**
 * Variables and option values become XML element names and CSV column
 * headers, so they must respect NMTOKEN rules.
 */
export const allowedVariableNameRow =
  (subject = 'attribute name'): RowValidator =>
  (value) => {
    // Anything that is not text is not a name; stringifying it would either
    // pass a number that is legal anyway or report `[object Object]` back to
    // the researcher as if they had typed it.
    const text =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    return /^[a-zA-Z0-9._\-:]+$/.test(text)
      ? undefined
      : `Not a valid ${subject}. Only letters, numbers and the symbols ._-: are supported`;
  };

/**
 * Every rule's complaint, not just the first.
 *
 * A cell shows all of them at once because a row is edited in place: there is
 * no submit to reveal the next problem after the first is fixed, so reporting
 * them one at a time would walk the researcher through the same cell several
 * times.
 */
export const rowIssues = (
  validators: readonly RowValidator[],
  value: unknown,
  allValues: Record<string, unknown> | undefined,
  name: string,
): string[] => {
  const issues: string[] = [];
  for (const validate of validators) {
    const message = validate(value, allValues, name);
    if (message !== undefined) issues.push(message);
  }
  return issues;
};
