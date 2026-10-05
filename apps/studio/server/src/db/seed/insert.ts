// Batched multi-row INSERT, the supported bulk path for a role subject to
// row-level security (ADR #1246 recorded that Postgres refuses COPY FROM for
// one). Chunked so a batch never exceeds the wire protocol's 65 535 bound
// parameters.
import type pg from 'pg';

const MAX_BIND_PARAMETERS = 65_535;

/**
 * Well under the parameter ceiling on purpose: planning a VALUES list grows
 * superlinearly in its row count, and a statement carrying tens of thousands
 * of parameters spends more time being planned than executed.
 */
const MAX_ROWS_PER_STATEMENT = 500;

export type SeedRowValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | Buffer
  | readonly string[]
  | null;

/**
 * `rows` are positional against `columns`. Column names are interpolated, so
 * they must be literals in this source — never anything a caller derived from
 * data.
 */
export async function insertRows(
  client: pg.ClientBase,
  table: string,
  columns: readonly string[],
  rows: readonly SeedRowValue[][],
): Promise<void> {
  if (rows.length === 0) return;
  const perChunk = Math.max(
    1,
    Math.min(
      MAX_ROWS_PER_STATEMENT,
      Math.floor(MAX_BIND_PARAMETERS / columns.length),
    ),
  );
  for (let start = 0; start < rows.length; start += perChunk) {
    const chunk = rows.slice(start, start + perChunk);
    const values: SeedRowValue[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(', ')}) values ${tuples.join(', ')}`,
      values,
    );
  }
}
