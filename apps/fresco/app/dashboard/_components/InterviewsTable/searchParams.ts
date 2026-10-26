import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { z } from 'zod/mini';

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

// Spelled out so the compiler checks it names every parser.
export const searchParamsUrlKeys: Record<
  keyof typeof searchParamsParsers,
  string
> = {
  page: `${INTERVIEWS_PREFIX}_page`,
  perPage: `${INTERVIEWS_PREFIX}_perPage`,
  sort: `${INTERVIEWS_PREFIX}_sort`,
  sortField: `${INTERVIEWS_PREFIX}_sortField`,
  q: `${INTERVIEWS_PREFIX}_q`,
  protocol: `${INTERVIEWS_PREFIX}_protocol`,
  started: `${INTERVIEWS_PREFIX}_started`,
  updated: `${INTERVIEWS_PREFIX}_updated`,
  progress: `${INTERVIEWS_PREFIX}_progress`,
  exported: `${INTERVIEWS_PREFIX}_exported`,
  network: `${INTERVIEWS_PREFIX}_network`,
};

export const searchParamsCache = createSearchParamsCache(searchParamsParsers, {
  urlKeys: searchParamsUrlKeys,
});

export type InterviewsSearchParams = Awaited<
  ReturnType<typeof searchParamsCache.parse>
>;
