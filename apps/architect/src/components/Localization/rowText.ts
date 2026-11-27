import { createSelector } from '@reduxjs/toolkit';

import {
  translationText,
  withMessage,
  withTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import {
  isBlankMessage,
  isBlankText,
  type LocaleTag,
  type LocalizedString,
} from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/store';
import { getTranslationGroups, type TranslationRow } from '~/selectors/issues';

import { pathKey, type TextPath } from './cellNames';

/** The table's rows by path, made once for each set of rows. */
const getTranslationRows = createSelector(
  [getTranslationGroups],
  (groups): ReadonlyMap<string, TranslationRow> =>
    new Map(
      groups.flatMap((group) =>
        group.rows.map((row) => [pathKey(row.path), row] as const),
      ),
    ),
);

/** The row of the text at `path`, if the protocol has it. */
export const findRow = (
  state: RootState,
  path: TextPath,
): TranslationRow | undefined => getTranslationRows(state).get(pathKey(path));

/** How a cell's text is written into the protocol. */
type TextKind = 'text' | 'message';

// Text that can show values is kept as written, like a localized message:
// read as plain or formatted text, its values would be flattened away.
const kindOf = (row: TranslationRow): TextKind =>
  row.arguments === undefined && row.dynamicValues === undefined
    ? 'text'
    : 'message';

/**
 * The cell's translation as its field holds it: the text a researcher reads
 * for a plain or formatted text, the message as written for a localized
 * message. Empty where there is none.
 */
export const storedTranslation = (row: TranslationRow, locale: LocaleTag) =>
  kindOf(row) === 'message'
    ? (row.value[locale] ?? '')
    : translationText(row.value, locale);

/**
 * Whether a cell's text is no translation at all, by the test the protocol
 * itself applies: blank, or only characters participants would not see.
 * Such a cell clears its translation.
 */
export const isBlankTranslation = (row: TranslationRow, text: string) =>
  kindOf(row) === 'message' ? isBlankMessage(text) : isBlankText(text);

/**
 * `value` with the cell's translation in `locale` replaced by `text`. An
 * emptied cell holds none of the researcher's wording, so a text Network
 * Canvas words reads as Network Canvas words it in that language, where it
 * has wording, and any other text has no translation in it.
 */
export const withCellText = (
  row: TranslationRow,
  value: LocalizedString,
  locale: LocaleTag,
  text: string,
): LocalizedString => {
  const blank = isBlankTranslation(row, text);
  const supplied = blank ? row.supplied?.[locale] : undefined;
  if (supplied !== undefined) return { ...value, [locale]: supplied };
  return (
    (kindOf(row) === 'message'
      ? withMessage(value, locale, blank ? undefined : text)
      : withTranslation(value, locale, blank ? '' : text)) ?? {}
  );
};

/**
 * The row's value with its cell in `locale` holding `text`: what an emptied
 * cell leaves participants reading in that language to see.
 */
export const rowValueWithCell = (
  row: TranslationRow,
  locale: LocaleTag,
  text: string,
): LocalizedString => withCellText(row, row.value, locale, text);

/**
 * The text a cell holds when it holds Network Canvas's own wording, for a
 * text Network Canvas words in `locale`.
 */
export const suppliedCellText = (row: TranslationRow, locale: LocaleTag) =>
  row.supplied?.[locale] === undefined
    ? undefined
    : storedTranslation({ ...row, value: row.supplied }, locale);
