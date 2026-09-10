import { isEqual } from 'es-toolkit/compat';

import {
  createMessageError,
  defineMessage,
  defineMessages,
} from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import { normalizeForComparison } from '@codaco/shared-consts';

/**
 * Case-insensitive AND Unicode-canonical: a precomposed and a decomposed
 * spelling of the same text are the same answer, so they are the same value
 * here too. See `@codaco/shared-consts`' `canonical-text`.
 */
export const isSameAnswer = (left: unknown, right: unknown) =>
  typeof left === 'string' && typeof right === 'string'
    ? normalizeForComparison(left) === normalizeForComparison(right)
    : isEqual(left, right);

/**
 * A cell's own complaints.
 *
 * Every one crosses a string-only contract — a rule below answers with the
 * `string | undefined` a row hands to `UnconnectedField`'s `errors` — so they
 * are encoded here and decoded where the field renders them.
 */
const rowRequiredMessage = defineMessage({
  id: 'protocolBuilder.arrayField.rowRequired',
  defaultMessage: 'Required',
  description:
    'Shown under one cell of a row in an editable list when the researcher has left it empty. Terse because it sits inside a row of a table-like list rather than under a full-width field.',
});

/**
 * The subjects `invalidVariableName` reports about.
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
 * second definition is how a cell comes to read as answered while something
 * else blocks it as empty, with no error on screen saying which row is at
 * fault.
 */
export const requiredCell = (value: unknown): string | undefined =>
  isUnanswered(value) ? createMessageError(rowRequiredMessage) : undefined;

/**
 * Whether another row of the same list already holds `value` in `column`.
 *
 * Counts from two because the row asking is itself one of `rows`.
 *
 * Emptiness is `requiredCell`'s business, and it is the same emptiness: two
 * rows that have both been left blank are not a clash to report. `0` and
 * `false` ARE answers, and two rows holding either genuinely do clash.
 */
export const isDuplicatedInColumn = (
  rows: readonly unknown[],
  column: string,
  value: unknown,
): boolean => {
  if (isUnanswered(value)) return false;

  const matches = rows.filter(
    (row) =>
      typeof row === 'object' &&
      row !== null &&
      isSameAnswer(Reflect.get(row, column), value),
  ).length;

  return matches >= 2;
};

/**
 * Variables and option values become XML element names and CSV column
 * headers, so they must respect NMTOKEN rules.
 */
export const invalidVariableName = (
  value: unknown,
  subject: MessageDescriptor = variableNameSubjects.attributeName,
): string | undefined => {
  // Anything that is not text is not a name; stringifying it would either
  // pass a number that is legal anyway or report `[object Object]` back to
  // the researcher as if they had typed it.
  const text =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
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
 * Every complaint a cell has, not just the first.
 *
 * A cell shows all of them at once because a row is edited in place: there is
 * no submit to reveal the next problem after the first is fixed, so reporting
 * them one at a time would walk the researcher through the same cell several
 * times.
 */
export const cellIssues = (
  ...issues: readonly (string | undefined)[]
): string[] => issues.filter((issue) => issue !== undefined);
