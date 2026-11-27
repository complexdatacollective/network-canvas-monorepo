import { useMemo } from 'react';

import type { LocaleTag } from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';
import type { TranslationRow } from '~/selectors/issues';

import { type CellLogic, readCellLogic } from './logicEdits';

export type TextPath = TranslationRow['path'];

/**
 * What the form field of one cell of the translation table holds: the
 * cell's translation, and the changes that its editor made to the logic of
 * the text's owner (its stage, or its node label), if it made any. The field
 * is unsaved while it holds anything other than what it was registered with,
 * and Escape in the cell resets it, which puts back both.
 */
export type CellValue = Readonly<{ text: string; logic?: CellLogic }>;

/** A cell's value holding `text` and `logic`, with no logic when there is none. */
export const cellValue = (text: string, logic?: CellLogic): CellValue =>
  logic === undefined ? { text } : { text, logic };

/**
 * The value of a cell's field as a `CellValue`: a field that holds anything
 * else holds no text and no logic.
 */
export const readCellValue = (value: unknown): CellValue => {
  if (!isRecord(value) || typeof value.text !== 'string') return { text: '' };
  return cellValue(value.text, readCellLogic(value.logic));
};

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
