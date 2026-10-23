import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';

export const PARTICIPANTS_PREFIX = 'pt';

export const sortOrder = ['asc', 'desc', 'none'] as const;
export const sortableFields = ['identifier', 'label', 'interviews'] as const;

export const searchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: parseAsStringLiteral(sortOrder).withDefault('none'),
  sortField: parseAsStringLiteral(sortableFields).withDefault('identifier'),
  q: parseAsString,
};

// Spelled out so the compiler checks it names every parser.
export const searchParamsUrlKeys: Record<
  keyof typeof searchParamsParsers,
  string
> = {
  page: `${PARTICIPANTS_PREFIX}_page`,
  perPage: `${PARTICIPANTS_PREFIX}_perPage`,
  sort: `${PARTICIPANTS_PREFIX}_sort`,
  sortField: `${PARTICIPANTS_PREFIX}_sortField`,
  q: `${PARTICIPANTS_PREFIX}_q`,
};

export const searchParamsCache = createSearchParamsCache(searchParamsParsers, {
  urlKeys: searchParamsUrlKeys,
});

export type ParticipantsSearchParams = Awaited<
  ReturnType<typeof searchParamsCache.parse>
>;
