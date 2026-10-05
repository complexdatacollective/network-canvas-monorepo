import { isEqual } from 'es-toolkit/compat';

import { createMessageError, defineMessage } from '@codaco/app-i18n/messages';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import {
  CodebookNameSchema,
  type ExportColumnEntity,
  type ExportColumnVariable,
  normalizeCodebookName,
  normalizeForComparison,
} from '@codaco/shared-consts';

import { exportColumnRefusals } from '../../fields/variableNameRules.ts';

/**
 * Case-insensitive AND Unicode-canonical: a precomposed and a decomposed
 * spelling of the same text are the same answer, so they are the same value
 * here too. See `@codaco/shared-consts`' `canonical-text`.
 */
const isSameAnswer = (left: unknown, right: unknown) =>
  typeof left === 'string' && typeof right === 'string'
    ? normalizeForComparison(left) === normalizeForComparison(right)
    : isEqual(left, right);

const optionValueKey = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? normalizeForComparison(normalizeCodebookName(String(value)))
    : undefined;

/**
 * Whether two option values are one value, compared the way the codebook write
 * compares them: as they will be stored (`normalizeCodebookName`), as text, and
 * as `isSameAnswer` compares text. The values `1` and `"1"` export to the same
 * column, and `"a "` is stored as `"a"`, so each pair is one value.
 */
export const isSameOptionValue = (left: unknown, right: unknown) => {
  const leftKey = optionValueKey(left);
  const rightKey = optionValueKey(right);
  return leftKey === undefined || rightKey === undefined
    ? isEqual(left, right)
    : leftKey === rightKey;
};

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

const invalidOptionValueMessage = defineMessage({
  id: 'protocolBuilder.arrayField.invalidOptionValue',
  defaultMessage:
    'Cannot contain line breaks, tabs or other control characters',
  description:
    'Shown under the value cell of an option in an editable list when the text holds a character that cannot be stored in a value, such as a line break or a tab. Terse because it sits inside a row of a table-like list. A value may otherwise be written in any language or script, with spaces and punctuation.',
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
 *
 * `isSame` is what makes two cells one answer; option values pass
 * `isSameOptionValue`.
 */
export const isDuplicatedInColumn = (
  rows: readonly unknown[],
  column: string,
  value: unknown,
  isSame: (left: unknown, right: unknown) => boolean = isSameAnswer,
): boolean => {
  if (isUnanswered(value)) return false;

  const matches = rows.filter(
    (row) =>
      typeof row === 'object' &&
      row !== null &&
      isSame(Reflect.get(row, column), value),
  ).length;

  return matches >= 2;
};

/**
 * What an option's stored value may not hold, judged as it will be stored.
 *
 * An option value reaches an export column name, so it follows the codebook's
 * name rule — any script, spaces and punctuation, but no control characters —
 * and is trimmed and put in canonical form on the way in, which is why a
 * trailing space is not a complaint here. Nothing entered is `requiredCell`'s
 * business, and anything that is not text has nothing typed to judge.
 */
export const invalidOptionValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = normalizeCodebookName(String(value));
  return text === '' || CodebookNameSchema.safeParse(text).success
    ? undefined
    : createMessageError(invalidOptionValueMessage);
};

/**
 * What an options editor needs to know to tell a researcher that an option
 * would put two things in one export column: which attribute the options
 * belong to, as it stands now, and the others it shares a type with.
 *
 * An option exports to `{attribute}_{value}`, so whether a value is free
 * depends on the attribute's name and its siblings, which the list of options
 * does not hold.
 */
export type OptionExportColumns = Readonly<{
  entity: ExportColumnEntity;
  name: string;
  type: string;
  siblings: readonly ExportColumnVariable[];
}>;

/**
 * Why this one option value would make the export write two things to one
 * column, or `undefined` while it would not.
 *
 * Judged as it will be stored, like `invalidOptionValue`, and asked of the
 * value alone: the attribute's other options cannot clash with it, because
 * they share its name and differ in value.
 */
export const optionExportColumnIssue = (
  value: unknown,
  columns: OptionExportColumns | undefined,
): string | undefined => {
  if (columns === undefined) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const optionValue =
    typeof value === 'string' ? normalizeCodebookName(value) : value;
  if (optionValue === '') return undefined;
  return exportColumnRefusals({
    entity: columns.entity,
    candidate: {
      name: columns.name,
      type: columns.type,
      options: [{ value: optionValue }],
    },
    siblings: columns.siblings,
  }).find(({ origin }) => origin.kind === 'option')?.message;
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

const duplicateLabelMessage = defineMessage({
  id: 'protocolBuilder.option.duplicateLabelRow',
  defaultMessage: 'Labels must be unique',
  description:
    'Shown under one option’s label cell when another option in the same list already reads the same way. Terse because it sits inside a row.',
});

/**
 * What one option's label cell complains about: nothing written, or another
 * option in the same list a participant would read the same way.
 *
 * Shared by every surface that authors an option label — the inline list a
 * form-field, composer, bin or tie-strength row mounts, and the codebook's own
 * attribute editor — so the complaint a researcher reads, and the moment they
 * read it, does not depend on which door they came through. The array-level
 * and codebook-write counterparts of the same rule are
 * `hasDuplicateOptionLabels`; this is the one that says it where they are
 * typing.
 */
export const optionLabelIssues = (
  value: unknown,
  rows: readonly unknown[],
): string[] =>
  cellIssues(
    requiredCell(value),
    isDuplicatedInColumn(rows, 'label', value)
      ? createMessageError(duplicateLabelMessage)
      : undefined,
  );
