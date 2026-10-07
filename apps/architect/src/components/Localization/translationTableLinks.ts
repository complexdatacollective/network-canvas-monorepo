import type { LocaleTag } from '@codaco/protocol-validation';

const TRANSLATION_TABLE_PATH = '/protocol/localization/table';
const MISSING_PARAM = 'missing';
const ANY_LANGUAGE = 'any';

/**
 * Which texts the translation table shows: every text, those missing a
 * translation into any language it shows, or those missing one into a
 * single language.
 */
export type MissingFilter =
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'any' }>
  | Readonly<{ kind: 'language'; locale: LocaleTag }>;

const filterValue = (filter: MissingFilter) => {
  if (filter.kind === 'all') return null;
  return filter.kind === 'any' ? ANY_LANGUAGE : filter.locale;
};

/** The translation table, showing the texts `filter` picks. */
export const translationTableHref = (
  filter: MissingFilter = { kind: 'all' },
) => {
  const value = filterValue(filter);
  if (value === null) return TRANSLATION_TABLE_PATH;
  const params = new URLSearchParams({ [MISSING_PARAM]: value });
  return `${TRANSLATION_TABLE_PATH}?${params.toString()}`;
};

/**
 * The texts a translation table URL asks to show. A language the protocol
 * does not have asks for nothing, so the table shows every text.
 */
export const readMissingFilter = (
  params: URLSearchParams,
  locales: readonly LocaleTag[],
): MissingFilter => {
  const value = params.get(MISSING_PARAM);
  if (value === ANY_LANGUAGE) return { kind: 'any' };
  if (value !== null && locales.includes(value)) {
    return { kind: 'language', locale: value };
  }
  return { kind: 'all' };
};

/** `params` as they would be with `filter` chosen, and nothing else changed. */
export const writeMissingFilter = (
  params: URLSearchParams,
  filter: MissingFilter,
) => {
  const next = new URLSearchParams(params);
  const value = filterValue(filter);
  if (value === null) next.delete(MISSING_PARAM);
  else next.set(MISSING_PARAM, value);
  return next;
};
