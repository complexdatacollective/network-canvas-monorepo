import type { LocaleTag } from '@codaco/protocol-validation';

const LANGUAGES_PATH = '/protocol/localization';
const TABLE_PARAM = 'table';
const TABLE_OPEN = 'open';
const MISSING_PARAM = 'missing';
const ANY_LANGUAGE = 'any';
const OPENED_FROM_LANGUAGES_KEY = 'translationTableOpenedFromLanguages';

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

/**
 * The Languages page with the translation table open over it, showing the
 * texts `filter` picks.
 */
export const translationTableHref = (
  filter: MissingFilter = { kind: 'all' },
) => {
  const params = new URLSearchParams({ [TABLE_PARAM]: TABLE_OPEN });
  const value = filterValue(filter);
  if (value !== null) params.set(MISSING_PARAM, value);
  return `${LANGUAGES_PATH}?${params.toString()}`;
};

export const isTranslationTableOpen = (params: URLSearchParams) =>
  params.get(TABLE_PARAM) === TABLE_OPEN;

/** `params` with the translation table closed, and nothing else changed. */
export const withoutTranslationTable = (params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.delete(TABLE_PARAM);
  next.delete(MISSING_PARAM);
  return next;
};

/**
 * History state for an entry that opens the table over the Languages page it
 * was opened from, so closing it can return to that page's own entry instead
 * of adding another one after it.
 */
export const openedFromLanguagesState = {
  [OPENED_FROM_LANGUAGES_KEY]: true,
} as const;

export const wasOpenedFromLanguages = (state: unknown) =>
  typeof state === 'object' &&
  state !== null &&
  OPENED_FROM_LANGUAGES_KEY in state &&
  state[OPENED_FROM_LANGUAGES_KEY] === true;

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
