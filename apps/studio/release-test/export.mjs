// Exports every row Studio keeps, one NDJSON file per table (#1901).
//
//   node apps/studio/release-test/export.mjs <out-dir>
//
// Run with the lane's Compose environment set (lib.sh's use_deployment): it
// reads through `docker compose exec -T postgres psql`, as the stack's own
// database login, so it needs nothing on this host but Docker and sees every
// row whatever row-level security says (that login owns the database).
//
// Tables are those of `public` and `studio_jobs`, minus the two that change
// by design on every upgrade: `studio_migrations` (the history `migrate`
// appends to) and `schemaFingerprint` (the stamp it rewrites). Rows are
// `to_jsonb(row)` ordered by primary key, so two exports of the same data are
// byte-identical; tables.json records each table's key columns for the diff.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const EXCLUDED = new Set([
  'public.studio_migrations',
  'public.schemaFingerprint',
]);

// The postgres image's environment names the login and database it was
// initialised with, so nothing here repeats `.env`.
function psql(sql) {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 },
  );
}

const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

function tables() {
  const rows = psql(`
    SELECT json_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'key', coalesce((
        SELECT json_agg(a.attname ORDER BY k.ordinality)
          FROM pg_index i
          CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
         WHERE i.indrelid = c.oid AND i.indisprimary
      ), '[]'::json))
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p')
       AND n.nspname IN ('public', 'studio_jobs')
     ORDER BY n.nspname, c.relname;
  `);
  return rows
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line))
    .filter(({ schema, table }) => !EXCLUDED.has(`${schema}.${table}`));
}

function main([outDir]) {
  if (!outDir) {
    console.error('usage: export.mjs <out-dir>');
    process.exit(64);
  }
  mkdirSync(outDir, { recursive: true });
  const list = tables();
  if (list.length === 0) {
    console.error('export.mjs: the database has no Studio tables');
    process.exit(1);
  }
  let rows = 0;
  for (const { schema, table, key } of list) {
    if (key.length === 0) {
      console.error(
        `export.mjs: ${schema}.${table} has no primary key to order by`,
      );
      process.exit(1);
    }
    const order = key.map(quote).join(', ');
    const out = psql(
      `SELECT to_jsonb(t)::text FROM ${quote(schema)}.${quote(table)} t ORDER BY ${order};`,
    );
    writeFileSync(join(outDir, `${schema}.${table}.ndjson`), out);
    rows += out.split('\n').filter((line) => line !== '').length;
  }
  writeFileSync(
    join(outDir, 'tables.json'),
    `${JSON.stringify(list, null, 2)}\n`,
  );
  console.log(
    `  exported ${rows} rows from ${list.length} tables to ${outDir}`,
  );
}

main(process.argv.slice(2));
