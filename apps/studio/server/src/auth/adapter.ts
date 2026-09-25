import { PgClient } from '@effect/sql-pg';
import { BetterAuthError } from 'better-auth';
import {
  type AdapterFactoryConfig,
  type AdapterFactoryCustomizeAdapterCreator,
  type CleanedWhere,
  type CustomAdapter,
  createAdapterFactory,
} from 'better-auth/adapters';
import type { BetterAuthOptions, DBAdapter } from 'better-auth/types';
import { getColumns, getTableName } from 'drizzle-orm';
import { Predicate } from 'effect';
import type { Statement } from 'effect/unstable/sql';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import type { SqlBridge } from './sql-bridge.ts';

// better-auth's database adapter, over `@effect/sql-pg` (#1927 §12, S6 §3).
//
// Statements are written with the client's `sql` template rather than drizzle's
// builder, and that is deliberate: better-auth hands an adapter *dynamic* model
// and field strings, so a typed builder would be indexed by `string` and need
// `any` at every access (which is how the drizzle adapter reads). What the
// builder would have guaranteed is guaranteed instead by two rules:
//
// 1. **An identifier allowlist.** Every table and column a call names is looked
//    up in `db/auth-schema.ts` and refused with a `BetterAuthError` when it is
//    not there. A better-auth upgrade that adds a model or a column fails
//    loudly at first use instead of writing somewhere unexpected.
// 2. **Escaped identifiers, bound values.** Identifiers go through `sql(name)`
//    and every value is a template interpolation, which is a bind parameter.
//    `sql.unsafe` is never used here.
//
// Two answers differ from both reference adapters on purpose, and
// `__tests__/adapter-conformance.test.ts` asserts each: `update` touches one
// row, as better-auth's contract documents and neither reference adapter does;
// and a pattern operator matches the caller's `%`, `_` and `\` literally
// rather than as wildcards the caller never asked for.

type Sql = PgClient.PgClient;
type Fragment = Statement.Fragment;

/**
 * Every auth table's physical columns, walked once out of the drizzle
 * declarations the schema is generated from.
 */
const AUTH_COLUMNS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.values(AUTH_TABLES).map((table) => [
    getTableName(table),
    new Set(Object.values(getColumns(table)).map((column) => column.name)),
  ]),
);

type Table = { readonly name: string; readonly columns: ReadonlySet<string> };

function tableFor(model: string): Table {
  const columns = AUTH_COLUMNS.get(model);
  if (columns === undefined) {
    throw new BetterAuthError(
      `Studio's auth adapter refuses the model "${model}": it is not an auth table in db/auth-schema.ts.`,
    );
  }
  return { name: model, columns };
}

function columnOf(table: Table, column: string): string {
  if (!table.columns.has(column)) {
    throw new BetterAuthError(
      `Studio's auth adapter refuses the column "${table.name}.${column}": it is not declared in db/auth-schema.ts.`,
    );
  }
  return column;
}

/** A write's columns, each checked, with the values it binds. */
function assignmentsOf(table: Table, values: unknown): [string, unknown][] {
  if (!Predicate.isObject(values)) {
    throw new BetterAuthError(
      `Studio's auth adapter was handed a write to "${table.name}" that is not a row.`,
    );
  }
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([column, value]) => [columnOf(table, column), value]);
}

/** `\`, `%` and `_` stand for themselves under `escape '\'`. */
const escapeLike = (value: string): string =>
  value.replaceAll(/[\\%_]/g, (character) => `\\${character}`);

function patternOf(where: CleanedWhere): string {
  if (!Predicate.isString(where.value)) {
    throw new BetterAuthError(
      `Studio's auth adapter needs a string for the "${where.operator}" operator on "${where.field}".`,
    );
  }
  const escaped = escapeLike(where.value);
  switch (where.operator) {
    case 'starts_with':
      return `${escaped}%`;
    case 'ends_with':
      return `%${escaped}`;
    default:
      return `%${escaped}%`;
  }
}

function listOf(where: CleanedWhere): ReadonlyArray<unknown> {
  if (!Array.isArray(where.value)) {
    throw new BetterAuthError(
      `Studio's auth adapter needs an array for the "${where.operator}" operator on "${where.field}".`,
    );
  }
  return where.value;
}

/**
 * One clause, clause for clause the drizzle adapter's semantics. `mode:
 * 'insensitive'` applies only where the value is a string or an array of them,
 * as it does there: `lower()` for the equality family, `ilike` for patterns.
 *
 * An empty list is a constant rather than a bound array: `in ()` is a syntax
 * error, and rc.115 cannot infer a type for an empty array parameter.
 */
function condition(sql: Sql, table: Table, where: CleanedWhere): Fragment {
  const column = sql(columnOf(table, where.field));
  const insensitive =
    where.mode === 'insensitive' &&
    (Predicate.isString(where.value) ||
      (Array.isArray(where.value) && where.value.every(Predicate.isString)));
  switch (where.operator) {
    case 'in': {
      const values = listOf(where);
      if (values.length === 0) return sql`false`;
      return insensitive
        ? sql`lower(${column}) in (select lower(v) from unnest(${values}) as v)`
        : sql`${column} = any(${values})`;
    }
    case 'not_in': {
      const values = listOf(where);
      if (values.length === 0) return sql`true`;
      return insensitive
        ? sql`lower(${column}) not in (select lower(v) from unnest(${values}) as v)`
        : sql`${column} <> all(${values})`;
    }
    case 'contains':
    case 'starts_with':
    case 'ends_with':
      return insensitive
        ? sql`${column} ilike ${patternOf(where)} escape '\\'`
        : sql`${column} like ${patternOf(where)} escape '\\'`;
    case 'lt':
      return sql`${column} < ${where.value}`;
    case 'lte':
      return sql`${column} <= ${where.value}`;
    case 'gt':
      return sql`${column} > ${where.value}`;
    case 'gte':
      return sql`${column} >= ${where.value}`;
    case 'ne':
      if (where.value === null) return sql`${column} is not null`;
      return insensitive
        ? sql`lower(${column}) <> lower(${where.value})`
        : sql`${column} <> ${where.value}`;
    case 'eq':
      if (where.value === null) return sql`${column} is null`;
      return insensitive
        ? sql`lower(${column}) = lower(${where.value})`
        : sql`${column} = ${where.value}`;
  }
}

/**
 * The drizzle adapter's grouping, which better-auth's callers assume: every
 * `AND` clause and, when there are any, the `OR` clauses as one disjunction —
 * `(a and b) and (c or d)`. No clause at all matches every row.
 */
function whereOf(
  sql: Sql,
  table: Table,
  where: ReadonlyArray<CleanedWhere> | undefined,
): Fragment {
  const clauses = (where ?? [])
    .filter((clause) => clause.connector === 'AND')
    .map((clause) => condition(sql, table, clause));
  const alternatives = (where ?? [])
    .filter((clause) => clause.connector === 'OR')
    .map((clause) => condition(sql, table, clause));
  if (alternatives.length > 0) clauses.push(sql.or(alternatives));
  return clauses.length === 0 ? sql`true` : sql.and(clauses);
}

/**
 * The one row a single-row statement acts on: chosen by the sub-select, and
 * re-checked by the outer predicate. The re-check is what makes `incrementOne`
 * a compare-and-swap. Under read committed a statement that waited on a row
 * lock re-evaluates only its own `where` against the row's new version, not the
 * sub-select, so a guard written only inside the sub-select would pass on the
 * value it read before the wait — two concurrent decrements of a counter at 1
 * would both succeed.
 */
function oneRow(sql: Sql, table: Table, where: Fragment): Fragment {
  return sql`id in (select id from ${sql(table.name)} where ${where} limit 1) and ${where}`;
}

function assignmentList(sql: Sql, assignments: [string, unknown][]): Fragment {
  return sql.csv(
    assignments.map(([column, value]) => sql`${sql(column)} = ${value}`),
  );
}

/**
 * The adapter over one bridge. `select` and `sortBy.field` arrive as
 * better-auth field names and are mapped here; `where[].field` arrives already
 * mapped to the physical column by the factory's `transformWhereClause`, and
 * mapping it again would be mapping the wrong thing (#1927 §12).
 */
const customAdapter =
  (bridge: SqlBridge) =>
  ({
    getFieldName,
  }: Parameters<AdapterFactoryCustomizeAdapterCreator>[0]): CustomAdapter => {
    const selection = (
      sql: Sql,
      table: Table,
      select: ReadonlyArray<string> | undefined,
    ): Fragment =>
      select === undefined || select.length === 0
        ? sql`*`
        : sql.csv(
            select.map(
              (field) =>
                sql`${sql(columnOf(table, getFieldName({ model: table.name, field })))}`,
            ),
          );

    /** Refused rather than ignored: see the `joins` note on `studioAuthAdapter`. */
    const refuseJoin = (join: unknown): void => {
      if (join !== undefined) {
        throw new BetterAuthError(
          "Studio's auth adapter does not implement joins; `advanced.database.joins` must stay unset so better-auth resolves them itself.",
        );
      }
    };

    return {
      create: async ({ model, data }) => {
        const table = tableFor(model);
        const row = Object.fromEntries(assignmentsOf(table, data));
        const [created] = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql<
                typeof data
              >`insert into ${sql(table.name)} ${sql.insert(row)} returning *`,
          ),
        );
        if (created === undefined) {
          throw new BetterAuthError(
            `Studio's auth adapter inserted into "${table.name}" and got no row back.`,
          );
        }
        return created;
      },

      findOne: async <T>({
        model,
        where,
        select,
        join,
      }: Parameters<CustomAdapter['findOne']>[0]) => {
        refuseJoin(join);
        const table = tableFor(model);
        const [row] = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql<T & object>`select ${selection(sql, table, select)}
                                from ${sql(table.name)}
                               where ${whereOf(sql, table, where)}
                               limit 1`,
          ),
        );
        return row ?? null;
      },

      findMany: async <T>({
        model,
        where,
        limit,
        select,
        sortBy,
        offset,
        join,
      }: Parameters<CustomAdapter['findMany']>[0]) => {
        refuseJoin(join);
        const table = tableFor(model);
        const rows = await bridge.run(
          PgClient.PgClient.use((sql) => {
            const order =
              sortBy === undefined
                ? sql``
                : sql`order by ${sql(
                    columnOf(
                      table,
                      getFieldName({ model: table.name, field: sortBy.field }),
                    ),
                  )} ${sortBy.direction === 'desc' ? sql`desc` : sql`asc`}`;
            return sql<T & object>`select ${selection(sql, table, select)}
                                     from ${sql(table.name)}
                                    where ${whereOf(sql, table, where)}
                                    ${order}
                                    limit ${limit}
                                   offset ${offset ?? 0}`;
          }),
        );
        return [...rows];
      },

      count: async ({ model, where }) => {
        const table = tableFor(model);
        // `::int`: an uncast `count(*)` is `int8`, which decodes to a `bigint`
        // and breaks better-auth's `number`.
        const [row] = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql<{ readonly count: number }>`select count(*)::int as count
                                                 from ${sql(table.name)}
                                                where ${whereOf(sql, table, where)}`,
          ),
        );
        return row?.count ?? 0;
      },

      update: async <T>({
        model,
        where,
        update,
      }: Parameters<CustomAdapter['update']>[0] & { update: T }) => {
        const table = tableFor(model);
        const assignments = assignmentsOf(table, update);
        if (where.length === 0 || assignments.length === 0) return null;
        const [row] = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql<T & object>`update ${sql(table.name)}
                                 set ${assignmentList(sql, assignments)}
                               where ${oneRow(sql, table, whereOf(sql, table, where))}
                           returning *`,
          ),
        );
        return row ?? null;
      },

      updateMany: async ({ model, where, update }) => {
        const table = tableFor(model);
        const assignments = assignmentsOf(table, update);
        if (assignments.length === 0) return 0;
        const rows = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql`update ${sql(table.name)}
                     set ${assignmentList(sql, assignments)}
                   where ${whereOf(sql, table, where)}
               returning 1`,
          ),
        );
        return rows.length;
      },

      // Every match, as both reference adapters do; an empty `where` deletes
      // nothing, as the memory adapter's does (`deleteMany` is the bulk form).
      delete: async ({ model, where }) => {
        const table = tableFor(model);
        if (where.length === 0) return;
        await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql`delete from ${sql(table.name)} where ${whereOf(sql, table, where)}`,
          ),
        );
      },

      deleteMany: async ({ model, where }) => {
        const table = tableFor(model);
        const rows = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql`delete from ${sql(table.name)}
                   where ${whereOf(sql, table, where)}
               returning 1`,
          ),
        );
        return rows.length;
      },

      // One round trip, and at most one row: what the magic-link token's
      // single use rests on.
      consumeOne: async <T>({
        model,
        where,
      }: Parameters<NonNullable<CustomAdapter['consumeOne']>>[0]) => {
        const table = tableFor(model);
        const [row] = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql<T & object>`delete from ${sql(table.name)}
                               where ${oneRow(sql, table, whereOf(sql, table, where))}
                           returning *`,
          ),
        );
        return row ?? null;
      },

      incrementOne: async <T>({
        model,
        where,
        increment,
        set,
      }: Parameters<NonNullable<CustomAdapter['incrementOne']>>[0]) => {
        const table = tableFor(model);
        const deltas = assignmentsOf(table, increment);
        const assignments = set === undefined ? [] : assignmentsOf(table, set);
        const [row] = await bridge.run(
          PgClient.PgClient.use(
            (sql) =>
              sql<T & object>`update ${sql(table.name)}
                                 set ${sql.csv([
                                   ...deltas.map(
                                     ([column, delta]) =>
                                       sql`${sql(column)} = ${sql(column)} + ${delta}`,
                                   ),
                                   ...(assignments.length === 0
                                     ? []
                                     : [assignmentList(sql, assignments)]),
                                 ])}
                               where ${oneRow(sql, table, whereOf(sql, table, where))}
                           returning *`,
          ),
        );
        return row ?? null;
      },
    };
  };

/**
 * A `timestamptz` decodes as epoch milliseconds on rc.115 and as a `Date` from
 * rc.116; better-auth wants a `Date` either way, which is also what the drizzle
 * adapter hands it. An `int8` decodes as a `bigint`, and better-auth's
 * `number` fields — `rateLimit.lastRequest` is the one declared `bigint` — are
 * millisecond timestamps well inside a double's exact range.
 */
const valueOut = (type: unknown, value: unknown): unknown => {
  if (
    type === 'date' &&
    (Predicate.isNumber(value) || Predicate.isString(value))
  ) {
    return new Date(value);
  }
  if (type === 'number' && Predicate.isBigInt(value)) return Number(value);
  return value;
};

const CONFIG = {
  adapterId: 'studio-sql-pg',
  adapterName: 'Studio @effect/sql-pg adapter',
  usePlural: false,
  debugLogs: false,
  // Every id column is `text`, minted by better-auth. `false` also makes
  // `advanced.database.generateId: 'serial'` refuse at construction rather
  // than write numbers into text ids.
  supportsNumericIds: false,
  supportsUUIDs: false,
  // A `Date` binds as a `timestamptz` parameter and round-trips exactly (the
  // stage-4 probe); what comes back is coerced below.
  supportsDates: true,
  supportsBooleans: true,
  // No auth column is json or an array; a future one is stringified into text.
  supportsJSON: false,
  supportsArrays: false,
  disableIdGeneration: false,
  customTransformOutput: ({ data, fieldAttributes }) =>
    valueOut(fieldAttributes.type, data),
} satisfies AdapterFactoryConfig;

/**
 * better-auth's adapter over the bridge.
 *
 * Its `transaction` is a real Postgres transaction. Studio's better-auth
 * transactions were sequential until this adapter: `drizzleAdapter`'s
 * `transaction` defaults to `false` and Studio never set it, so better-auth ran
 * its as-is fallback. Turning it on is stage 4's one deliberate behaviour
 * change (#1927 §12): sign-up's user, account and session land together or not
 * at all, and `withSecretsAdapter`'s transaction branch protects something
 * real. The transaction adapter is this factory again over the transaction's
 * bridge, with `transaction: false` — the drizzle adapter's own pattern.
 *
 * **Joins are not implemented.** better-auth forwards a `join` only while
 * `advanced.database.joins` is set, and otherwise resolves the relation itself
 * with further `findOne`/`findMany` calls. Studio leaves the flag unset (a
 * source test pins it), and the adapter throws if a join ever arrives, so
 * enabling it is a compile-and-test event rather than a silently degraded read.
 */
export const studioAuthAdapter =
  (bridge: SqlBridge) =>
  (options: BetterAuthOptions): DBAdapter =>
    createAdapterFactory({
      config: {
        ...CONFIG,
        transaction: (callback) =>
          bridge.transaction((inner) =>
            callback(
              createAdapterFactory({
                config: { ...CONFIG, transaction: false },
                adapter: customAdapter(inner),
              })(options),
            ),
          ),
      },
      adapter: customAdapter(bridge),
    })(options);
