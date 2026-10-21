import { Prisma } from '~/lib/db/generated/client';

import type { InterviewsSearchParams, NetworkCondition } from './searchParams';

function parseRange(raw: string | null): { lo: string; hi: string } | null {
  if (!raw) return null;
  const [lo, hi] = raw.split('..');
  if (lo === undefined || hi === undefined || lo === '' || hi === '') {
    return null;
  }
  return { lo, hi };
}

function operatorSql(op: NetworkCondition['operator']): Prisma.Sql {
  switch (op) {
    case 'eq':
      return Prisma.raw('=');
    case 'gt':
      return Prisma.raw('>');
    case 'lt':
      return Prisma.raw('<');
    case 'gte':
      return Prisma.raw('>=');
    case 'lte':
      return Prisma.raw('<=');
  }
}

/**
 * The number of stages progress is measured across: the stages up to and
 * including the first finish stage, as @codaco/interview counts them. Finish
 * stages after it are alternative endings reached only by skipping to one, so
 * they are left out; a protocol without a finish stage counts every stage.
 * Assumes the alias `p` (Protocol).
 */
export const PROGRESS_STAGE_COUNT_SQL =
  '(COALESCE((SELECT MIN(s.ord) FROM jsonb_array_elements(p."stages"::jsonb) WITH ORDINALITY AS s(stage, ord) WHERE s.stage->>\'type\' = \'FinishSession\'), jsonb_array_length(p."stages"::jsonb), 0))';

/**
 * Progress percentage expression mirroring `computeInterviewProgress`: a
 * finished interview (finishTime set) is 100%, otherwise progress is
 * currentStep / progress stage count (0 for a protocol with no stages), with
 * an interview resting on a later ending held below 100% until it is
 * finished. Assumes the aliases `i` (Interview) and `p` (Protocol).
 */
const PROGRESS_SQL = `(CASE WHEN i."finishTime" IS NOT NULL THEN 100 WHEN ${PROGRESS_STAGE_COUNT_SQL} = 0 THEN 0 ELSE (LEAST(i."currentStep", ${PROGRESS_STAGE_COUNT_SQL} - 1)::float / ${PROGRESS_STAGE_COUNT_SQL}) * 100 END)`;

/**
 * Builds the WHERE predicate (without the `WHERE` keyword) for the interview
 * list. Returns `Prisma.empty` when no filters are active. Column references
 * assume the aliases `i` (Interview), `p` (Protocol), `par` (Participant).
 */
export function buildInterviewWhere(
  params: InterviewsSearchParams,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (params.q) {
    conditions.push(
      Prisma.sql`par."identifier" ILIKE '%' || ${params.q} || '%'`,
    );
  }

  if (params.protocol && params.protocol.length > 0) {
    conditions.push(Prisma.sql`p."name" IN (${Prisma.join(params.protocol)})`);
  }

  const started = parseRange(params.started);
  if (started) {
    // Upper bound extended to end of day so date-only "to" values are inclusive.
    conditions.push(
      Prisma.sql`i."startTime" >= ${new Date(started.lo)} AND i."startTime" <= ${new Date(`${started.hi}T23:59:59.999`)}`,
    );
  }

  const updated = parseRange(params.updated);
  if (updated) {
    // Upper bound extended to end of day so date-only "to" values are inclusive.
    conditions.push(
      Prisma.sql`i."lastUpdated" >= ${new Date(updated.lo)} AND i."lastUpdated" <= ${new Date(`${updated.hi}T23:59:59.999`)}`,
    );
  }

  const progress = parseRange(params.progress);
  if (progress) {
    const min = Number(progress.lo);
    const max = Number(progress.hi);
    conditions.push(
      Prisma.sql`${Prisma.raw(PROGRESS_SQL)} BETWEEN ${min} AND ${max}`,
    );
  }

  if (params.exported !== null) {
    conditions.push(
      params.exported
        ? Prisma.sql`i."exportTime" IS NOT NULL`
        : Prisma.sql`i."exportTime" IS NULL`,
    );
  }

  if (params.network && params.network.length > 0) {
    // AND-combine each condition (see filterFns.js verification note).
    for (const c of params.network) {
      conditions.push(
        Prisma.sql`(SELECT COUNT(*) FROM jsonb_array_elements(
            COALESCE(i."network"->${c.entityKind}, '[]'::jsonb)) AS e
          WHERE e->>'type' = ${c.entityType}) ${operatorSql(c.operator)} ${c.value}`,
      );
    }
  }

  if (conditions.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

const DEFAULT_SORT_COLUMN = 'i."lastUpdated"';

const SORT_COLUMN: Record<string, string | undefined> = {
  identifier: 'par."identifier"',
  protocolName: 'p."name"',
  startTime: 'i."startTime"',
  lastUpdated: 'i."lastUpdated"',
  exportTime: 'i."exportTime"',
  progress: PROGRESS_SQL,
};

export function buildInterviewOrderBy(
  params: InterviewsSearchParams,
): Prisma.Sql {
  if (params.sort === 'none') {
    return Prisma.sql`ORDER BY i."lastUpdated" DESC, i."id" DESC`;
  }
  const col = SORT_COLUMN[params.sortField] ?? DEFAULT_SORT_COLUMN;
  const dir = params.sort === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
  return Prisma.sql`ORDER BY ${Prisma.raw(col)} ${dir}, i."id" DESC`;
}
