// Diffs two exports (export.mjs) of one instance, taken before and after an
// upgrade (#1901).
//
//   node apps/studio/release-test/diff-export.mjs <before> <after> <out.json> \
//     [--probe-job <id>]
//
// Exits 1, after writing <out.json>, on any difference no mask accounts for.
//
// The rule: a table or a column present after and not before is what an
// upgrade is allowed to add — a new column or table from the delta is
// expected — but a ROW present after and not before is data, and needs a
// reason, in any table, including one the upgrade created. Everything the
// before-export held must still be there with the same value: a lost table, a
// lost row, a lost column or a changed value is a difference.
//
// MASKS are the exceptions, and each one names why. A mask is added only
// after a run has shown the change it covers (its `seen` line says which),
// never in anticipation of one — an unused mask is reported in <out.json> so
// a mask that stopped matching anything can be retired.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual, parseArgs } from 'node:util';

/**
 * @typedef {{
 *   kind: 'table-lost' | 'row-lost' | 'row-added' | 'column-lost' | 'value-changed',
 *   table: string,
 *   key?: unknown,
 *   column?: string,
 *   before?: unknown,
 *   after?: unknown,
 * }} Difference
 *
 * @typedef {{
 *   name: string,
 *   kind: Difference['kind'],
 *   table: string,
 *   column?: string,
 *   when?: (difference: Difference, context: MaskContext) => boolean,
 *   reason: string,
 *   seen: string,
 * }} Mask
 */

/**
 * @typedef {{
 *   probeJobId: string | null,
 *   cronQueues: Set<string>,
 *   firedSchedules: Set<string>,
 * }} MaskContext
 */

/** @type {Mask[]} */
export const MASKS = [
  {
    name: 'the probe job',
    kind: 'row-added',
    table: 'studio_jobs.jobs',
    when: (difference, { probeJobId }) =>
      probeJobId !== null &&
      typeof difference.after === 'object' &&
      difference.after !== null &&
      difference.after.id === probeJobId,
    reason:
      'The lane enqueues it itself, after the before-export, to prove a job queued during the window is worked after it; upgrade.sh asserts its states.',
    seen: 'every run, by construction',
  },
  {
    name: 'the maintenance flag date',
    kind: 'value-changed',
    table: 'public.deployment_state',
    column: 'updated_at',
    reason:
      'It dates the maintenance flag, and the upgrade sequence sets the flag and clears it; the flag itself (maintenance, reason) is compared and must be off again.',
    seen: 'run A, 6 Oct 2026: moved by maintenance on/off, nothing else changed',
  },
  {
    name: 'the cron schedule advancing',
    kind: 'value-changed',
    table: 'studio_jobs.job_schedules',
    column: 'next_run_at',
    // Only a schedule that fired during the run, moving forward: the worker
    // wrote that value when it fired. A schedule that did not fire, or moved
    // back, was changed by something else — a backfill that pushed it into
    // the future would also stop it firing.
    when: (difference, { firedSchedules }) =>
      firedSchedules.has(JSON.stringify(difference.key)) &&
      Date.parse(String(difference.after)) >
        Date.parse(String(difference.before)),
    reason:
      'The worker advances each schedule every time it fires; denied-attempts-summary fires every minute, so any run longer than a minute moves it. Masked only for a schedule whose queue gained a job during the run, and only forward.',
    seen: 'run A, 6 Oct 2026: denied-attempts-summary 13:48 → 13:49',
  },
  {
    name: 'a job the cron enqueued',
    kind: 'row-added',
    table: 'studio_jobs.jobs',
    when: (difference, { cronQueues }) =>
      typeof difference.after === 'object' &&
      difference.after !== null &&
      cronQueues.has(difference.after.queue),
    reason:
      'A queue with a schedule (studio_jobs.job_schedules) gets a new row every time its cron fires, upgrade or not. Rows of any other queue still need a reason.',
    seen: 'run A, 6 Oct 2026: one denied-attempts-summary row, completed',
  },
];

/** Reads one export directory into table name → { key, rows: Map }. */
export function readExport(dir) {
  const tables = JSON.parse(readFileSync(join(dir, 'tables.json'), 'utf8'));
  const result = new Map();
  for (const { schema, table, key } of tables) {
    const name = `${schema}.${table}`;
    const file = join(dir, `${name}.ndjson`);
    const rows = new Map();
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line === '') continue;
        const row = JSON.parse(line);
        rows.set(JSON.stringify(key.map((column) => row[column])), row);
      }
    }
    result.set(name, { key, rows });
  }
  return result;
}

/** The queues a cron schedule enqueues, read from the export itself. */
function scheduledQueues(exported) {
  const schedules = exported.get('studio_jobs.job_schedules');
  return new Set(
    schedules ? [...schedules.rows.values()].map((row) => row.queue) : [],
  );
}

/** @returns {Difference[]} */
export function differences(before, after) {
  /** @type {Difference[]} */
  const found = [];
  for (const [table, { rows: beforeRows }] of before) {
    const afterTable = after.get(table);
    if (!afterTable) {
      found.push({ kind: 'table-lost', table });
      continue;
    }
    for (const [key, row] of beforeRows) {
      const now = afterTable.rows.get(key);
      if (now === undefined) {
        found.push({
          kind: 'row-lost',
          table,
          key: JSON.parse(key),
          before: row,
        });
        continue;
      }
      for (const [column, value] of Object.entries(row)) {
        if (!(column in now)) {
          found.push({
            kind: 'column-lost',
            table,
            key: JSON.parse(key),
            column,
            before: value,
          });
        } else if (!isDeepStrictEqual(value, now[column])) {
          found.push({
            kind: 'value-changed',
            table,
            key: JSON.parse(key),
            column,
            before: value,
            after: now[column],
          });
        }
      }
    }
    for (const [key, row] of afterTable.rows) {
      if (!beforeRows.has(key)) {
        found.push({
          kind: 'row-added',
          table,
          key: JSON.parse(key),
          after: row,
        });
      }
    }
  }
  // A table the upgrade created held no rows before it, so every row it holds
  // now was added.
  for (const [table, { rows: afterRows }] of after) {
    if (before.has(table)) continue;
    for (const [key, row] of afterRows) {
      found.push({
        kind: 'row-added',
        table,
        key: JSON.parse(key),
        after: row,
      });
    }
  }
  return found;
}

/**
 * What the masks read besides the difference itself. A schedule fired during
 * the run when its queue gained a job between the two exports.
 * @returns {MaskContext}
 */
export function maskContext(found, after, probeJobId) {
  const cronQueues = scheduledQueues(after);
  const firedQueues = new Set(
    found
      .filter(
        ({ kind, table, after: row }) =>
          kind === 'row-added' &&
          table === 'studio_jobs.jobs' &&
          cronQueues.has(row?.queue),
      )
      .map(({ after: row }) => row.queue),
  );
  const schedules = after.get('studio_jobs.job_schedules');
  const firedSchedules = new Set(
    schedules
      ? [...schedules.rows]
          .filter(([, row]) => firedQueues.has(row.queue))
          .map(([key]) => key)
      : [],
  );
  return { probeJobId, cronQueues, firedSchedules };
}

/** Splits differences into those a mask accounts for and those it does not. */
export function applyMasks(found, masks, context) {
  const hits = Object.fromEntries(masks.map((mask) => [mask.name, 0]));
  const unmasked = [];
  for (const difference of found) {
    const mask = masks.find(
      (candidate) =>
        candidate.kind === difference.kind &&
        candidate.table === difference.table &&
        (candidate.column === undefined ||
          candidate.column === difference.column) &&
        (candidate.when === undefined || candidate.when(difference, context)),
    );
    if (mask) hits[mask.name] += 1;
    else unmasked.push(difference);
  }
  return { unmasked, hits };
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { 'probe-job': { type: 'string' } },
  });
  const [beforeDir, afterDir, outPath] = positionals;
  if (!beforeDir || !afterDir || !outPath) {
    console.error(
      'usage: diff-export.mjs <before> <after> <out.json> [--probe-job <id>]',
    );
    process.exit(64);
  }
  const before = readExport(beforeDir);
  const after = readExport(afterDir);
  const found = differences(before, after);
  const { unmasked, hits } = applyMasks(
    found,
    MASKS,
    maskContext(found, after, values['probe-job'] ?? null),
  );
  const rowsBefore = [...before.values()].reduce(
    (sum, t) => sum + t.rows.size,
    0,
  );
  const result = {
    ok: unmasked.length === 0,
    tables: before.size,
    rowsBefore,
    differences: unmasked,
    masked: MASKS.map(({ name, reason }) => ({
      name,
      reason,
      hits: hits[name],
    })),
  };
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  for (const difference of unmasked.slice(0, 40)) {
    console.error(`  DIFF  ${JSON.stringify(difference)}`);
  }
  if (unmasked.length > 40)
    console.error(`  … and ${unmasked.length - 40} more`);
  console.log(
    `  ${result.ok ? 'ok   ' : 'FAIL '} ${rowsBefore} rows in ${before.size} tables compared; ${unmasked.length} unmasked difference(s); masks: ${result.masked
      .map((mask) => `${mask.name}=${mask.hits}`)
      .join(', ')}`,
  );
  process.exit(result.ok ? 0 : 1);
}

// `import.meta.main`, not argv[1]: run.sh imports these with the module's path
// as an argument, which an argv comparison mistakes for running it.
if (import.meta.main) {
  main(process.argv.slice(2));
}
