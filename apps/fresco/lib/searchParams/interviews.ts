import {
  createLoader,
  type inferParserType,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { z } from 'zod/mini';

/**
 * The interviews-table URL contract, with no framework-bound pieces in it.
 *
 * `createSearchParamsCache` — the only RSC-bound part — stays in
 * `app/dashboard/_components/InterviewsTable/searchParams.ts`. `createLoader`
 * is a plain function over a search record, so the TanStack Start route uses
 * the same parsers, the same URL keys, and the same defaults.
 */

export const INTERVIEWS_PREFIX = 'iv';

export const sortOrder = ['asc', 'desc', 'none'] as const;
export const sortableFields = [
  'identifier',
  'protocolName',
  'startTime',
  'lastUpdated',
  'exportTime',
  'progress',
] as const;

// Network operator filter condition shape (matches fresco-ui OperatorCondition).
const networkConditionSchema = z.array(
  z.object({
    entityKind: z.enum(['nodes', 'edges']),
    entityType: z.string(),
    operator: z.enum(['eq', 'gt', 'lt', 'gte', 'lte']),
    value: z.number(),
  }),
);
export type NetworkCondition = z.infer<typeof networkConditionSchema>[number];

const parseNetwork = parseAsJson((v) => networkConditionSchema.parse(v));

export const searchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: parseAsStringLiteral(sortOrder).withDefault('none'),
  sortField: parseAsStringLiteral(sortableFields).withDefault('lastUpdated'),
  q: parseAsString,
  protocol: parseAsArrayOf(parseAsString),
  started: parseAsString, // "fromISO..toISO"
  updated: parseAsString, // "fromISO..toISO"
  progress: parseAsString, // "min..max"
  exported: parseAsBoolean,
  network: parseNetwork,
};

export const searchParamsUrlKeys = Object.fromEntries(
  Object.keys(searchParamsParsers).map((k) => [k, `${INTERVIEWS_PREFIX}_${k}`]),
) as Record<keyof typeof searchParamsParsers, string>;

export type InterviewsSearchParams = inferParserType<
  typeof searchParamsParsers
>;

const loader = createLoader(searchParamsParsers, {
  urlKeys: searchParamsUrlKeys,
});

/**
 * URL search record, as a router hands one over. Values are whatever survived
 * the query string, so unknown-typed entries are dropped rather than coerced —
 * a filter that is not a string or list of strings was not in the URL.
 */
type SearchRecord = Record<string, string | string[] | undefined>;

function toSearchRecord(search: Record<string, unknown>): SearchRecord {
  const record: SearchRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === 'string') {
      record[key] = value;
    } else if (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string')
    ) {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Framework-agnostic reader over the same parsers, used by the TanStack Start
 * route's `loaderDeps`. Narrowed to the synchronous overload: `createLoader`
 * only returns a promise when handed one.
 */
export function loadInterviewsSearchParams(
  search: Record<string, unknown>,
): InterviewsSearchParams {
  return loader(toSearchRecord(search));
}
