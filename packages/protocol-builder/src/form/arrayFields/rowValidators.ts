import { get, isEqual } from 'es-toolkit/compat';

import {
  createMessageError,
  defineMessage,
  defineMessages,
} from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
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

/**
 * Case-insensitive AND Unicode-canonical: a precomposed and a decomposed
 * spelling of the same text are the same answer, so they are the same value
 * here too. See `@codaco/shared-consts`' `canonical-text`.
 */
const isRoughlyEqual = (left: unknown, right: unknown) =>
  typeof left === 'string' && typeof right === 'string'
    ? normalizeForComparison(left) === normalizeForComparison(right)
    : isEqual(left, right);

/**
 * A row cell's own complaints.
 *
 * Every one crosses a string-only contract — a `RowValidator` answers with a
 * `string | undefined` that `RowField` hands to `FieldErrors` — so they are
 * encoded here and decoded there.
 */
const rowRequiredMessage = defineMessage({
  id: 'protocolBuilder.arrayField.rowRequired',
  defaultMessage: 'Required',
  description:
    'Shown under one cell of a row in an editable list when the researcher has left it empty. Terse because it sits inside a row of a table-like list rather than under a full-width field.',
});

/**
 * The subjects `allowedVariableNameRow` reports about.
 *
 * Whole nouns rather than words spliced together, and separate descriptors
 * rather than one: they are the object of a sentence, and a language that
 * inflects the object cannot get there from the English noun.
 */
export const variableNameSubjects = defineMessages({
  attributeName: {
    id: 'protocolBuilder.arrayField.attributeNameSubject',
    defaultMessage: 'attribute name',
    description:
      'What the researcher was entering, named inside the sentence that refuses it: the name of a codebook variable. Interpolated mid-sentence after "Not a valid", so it is lower case.',
  },
  optionValue: {
    id: 'protocolBuilder.arrayField.optionValueSubject',
    defaultMessage: 'option value',
    description:
      'What the researcher was entering, named inside the sentence that refuses it: the stored value of one option of a categorical or ordinal attribute, as opposed to the label a participant reads. Interpolated mid-sentence after "Not a valid", so it is lower case.',
  },
});

const invalidNameMessage = defineMessage({
  id: 'protocolBuilder.arrayField.invalidName',
  defaultMessage:
    'Not a valid {subject}. Only letters, numbers and the symbols ._-: are supported',
  description:
    'Shown under a cell whose text cannot be stored as an XML element name or a CSV column header. subject names what was being entered — an attribute name, an option value — already in the reader’s language. The characters listed are literal punctuation and stay as they are.',
});

/**
 * Nothing entered. `false` and `0` are answers; absent, empty and
 * whitespace-only are not.
 *
 * Emptiness is asked of Fresco's own `isUnanswered` — the predicate every
 * registered field's `required` rule already uses — rather than defined again
 * here. A row cell is not a registered field, but it sits in the same form as
 * ones that are, and the array-level rules that refuse the save trim too. A
 * second definition is how a row comes to read as answered while something
 * else blocks it as empty, with no error on screen saying which row is at
 * fault.
 */
export const requiredRow =
  (message = createMessageError(rowRequiredMessage)): RowValidator =>
  (value) =>
    isUnanswered(value) ? message : undefined;

/**
 * No other row of the same array may hold this value in the same column.
 *
 * Reads the cell's own resolved name (`options[3].label`) to find both the
 * array and the column, exactly as the host rule it replaces does, so a row
 * bound to the wrong index cannot silently compare itself against a different
 * column.
 *
 * `message` is REQUIRED, and it is a whole sentence. It used to be optional,
 * and the fallback built one out of the column's own field name —
 * `Labels must be unique` from `options[3].label` — which is a sentence no
 * translator can be handed: the capital and the plural `s` are English string
 * surgery over an identifier that is never translated at all. A caller naming
 * the clash it is actually reporting is the only version of this that can be
 * read in another language.
 */
export const uniqueRowAttribute =
  (message: string): RowValidator =>
  (value, allValues, name) => {
    // Emptiness is `required`'s business, and it is the same emptiness: two
    // rows that have both been left blank are not a clash to report. `0` and
    // `false` ARE answers, and two rows holding either genuinely do clash.
    if (isUnanswered(value)) return undefined;

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

    return matches >= 2 ? message : undefined;
  };

/**
 * Variables and option values become XML element names and CSV column
 * headers, so they must respect NMTOKEN rules.
 */
export const allowedVariableNameRow =
  (
    subject: MessageDescriptor = variableNameSubjects.attributeName,
  ): RowValidator =>
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
      : createMessageError(invalidNameMessage, {
          // Nested rather than resolved here: this rule runs wherever a value
          // is judged — including at module scope, before any reader has a
          // language — so the noun is settled at the same moment the sentence
          // around it is.
          subject: { messageError: createMessageError(subject) },
        });
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
