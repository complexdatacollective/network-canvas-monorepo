import { useMemo } from 'react';

import type { LocaleTag } from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';
import type { TranslationRow } from '~/selectors/issues';

import {
  type CellLogic,
  readCellLogic,
  readWordingWrites,
  wordingAfterWrite,
  wordingWithout,
  type WordingWrites,
} from './logicEdits';

export type TextPath = TranslationRow['path'];

/**
 * What the form field of one cell of the translation table holds: the
 * cell's translation, and the changes that its editor made to the logic of
 * the text's owner (its stage, or its node label), if it made any. The field
 * is unsaved while it holds anything other than what it was registered with,
 * and Escape in the cell resets it, which puts back both.
 *
 * The cell of a version of a dynamic attribute also keeps the wording that
 * other cells wrote into it through the dynamic attribute's popover, by the
 * cell that wrote it (see `WordingWrites`): Escape in that cell takes its
 * wording back out.
 */
export type CellValue = Readonly<{
  text: string;
  logic?: CellLogic;
  wordings?: WordingWrites;
}>;

/**
 * A cell's value holding `text` and `logic`, with no logic when there is
 * none. Text written this way is the cell's own, so it holds no other cell's
 * wording.
 */
export const cellValue = (text: string, logic?: CellLogic): CellValue =>
  logic === undefined ? { text } : { text, logic };

/**
 * The value of a cell's field as a `CellValue`: a field that holds anything
 * else holds no text and no logic.
 */
export const readCellValue = (value: unknown): CellValue => {
  if (!isRecord(value) || typeof value.text !== 'string') return { text: '' };
  const read = cellValue(value.text, readCellLogic(value.logic));
  const wordings = readWordingWrites(value.wordings);
  return wordings === undefined ? read : { ...read, wordings };
};

const withWording = (
  was: CellValue,
  { text, wordings }: Readonly<{ text: string; wordings?: WordingWrites }>,
): CellValue =>
  wordings === undefined
    ? cellValue(text, was.logic)
    : { ...cellValue(text, was.logic), wordings };

/**
 * The cell of a version's wording, `was`, once the popover of the cell whose
 * field is `writer` writes `text` into it.
 */
export const withWordingBy = (
  was: CellValue,
  writer: string,
  text: string,
): CellValue =>
  withWording(
    was,
    wordingAfterWrite({
      text: was.text,
      wordings: was.wordings,
      writer,
      next: text,
    }),
  );

/**
 * The cell of a version's wording, `was`, once the wording that the popover
 * of the cell whose field is `writer` wrote into it is taken back.
 */
export const withoutWordingBy = (was: CellValue, writer: string): CellValue =>
  withWording(
    was,
    wordingWithout({ text: was.text, wordings: was.wordings, writer }),
  );

/** Whether the popover of the cell whose field is `writer` wrote `value`'s wording. */
export const hasWordingBy = (value: CellValue, writer: string) =>
  value.wordings !== undefined && Object.hasOwn(value.wordings.by, writer);

/**
 * The form field holding one cell: the text's path and the cell's language,
 * spelled with letters and digits only, so the form store reads it as one
 * name rather than as a path of its own.
 */
export const translationFieldName = (path: TextPath, locale: LocaleTag) =>
  `t${hexOf(JSON.stringify([path, locale]))}`;

/** The text and language of the cell that `translationFieldName` named. */
export const readTranslationFieldName = (
  name: string,
): { path: TextPath; locale: LocaleTag } | undefined => {
  if (!name.startsWith('t')) return undefined;
  const parsed = readHex(name.slice(1));
  return Array.isArray(parsed) &&
    parsed.length === 2 &&
    Array.isArray(parsed[0]) &&
    typeof parsed[1] === 'string'
    ? { path: parsed[0] as TextPath, locale: parsed[1] }
    : undefined;
};

/** `value` spelled with letters and digits only, six for each character. */
const hexOf = (value: string) =>
  Array.from(value, (character) =>
    (character.codePointAt(0) ?? 0).toString(16).padStart(6, '0'),
  ).join('');

/** The JSON value that `hexOf` spelled, or undefined. */
const readHex = (digits: string): unknown => {
  if (digits.length % 6 !== 0) return undefined;
  const characters: string[] = [];
  for (let index = 0; index < digits.length; index += 6) {
    const codePoint = Number.parseInt(digits.slice(index, index + 6), 16);
    if (Number.isNaN(codePoint)) return undefined;
    characters.push(String.fromCodePoint(codePoint));
  }
  try {
    return JSON.parse(characters.join(''));
  } catch {
    return undefined;
  }
};

/** A key that is the same for every path with the same segments. */
export const pathKey = (path: readonly (string | number)[]) =>
  JSON.stringify(path);

/**
 * `path`, kept as the same array while its segments stay the same: a caller
 * that builds a path on each render can use it as a hook's dependency.
 * Undefined stays undefined.
 */
export const useStablePath = <
  Path extends readonly (string | number)[] | undefined,
>(
  path: Path,
): Path => {
  const key = path === undefined ? undefined : pathKey(path);
  // Only the key decides: `path` is a fresh array each render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => path, [key]);
};
