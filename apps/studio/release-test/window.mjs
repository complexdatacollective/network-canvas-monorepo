// The maintenance-window oracle (#1901): reads what observe.sh saw beside the
// step markers upgrade.sh wrote, and decides whether the instance was closed
// for the whole upgrade.
//
//   node apps/studio/release-test/window.mjs <observe.tsv> <events.tsv> <out.json>
//
// Exits 1, after writing <out.json>, when any rule fails. The rules:
//
//  1. The executed sequence entered maintenance mode, ran `migrate` and left
//     maintenance mode, in that order.
//  2. The window closed: within CLOSE_BOUND_MS of `maintenance on` returning,
//     /readyz named maintenance mode. The gate reads the flag through a
//     one-second cache, so this is a bound on the cache, not a sleep.
//  3. From then until `maintenance off` started, no tick saw a 200 — not from
//     /readyz and not from the probe — every probe got the maintenance page
//     (or the API's own maintenance problem; a bare 503 only while `up -d`
//     is replacing `web`, the page's own source), and every answer the API gave
//     /readyz named maintenance mode, or, for a process that had not yet read
//     the flag at all, "the server is starting". An API that named the
//     migration lock or the schema instead was serving on those triggers
//     alone, which is what a missing `maintenance on` looks like.
//  4. At least one /readyz answer from the API fell inside `migrate`, naming
//     maintenance mode: the window held while the schema moved.
//  5. After `maintenance off` returned, /readyz and the probe both reached 200.
//
// It also checks the observer was alive throughout: no two ticks inside the
// window more than MAX_GAP_MS apart, so silence cannot pass for closure.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** The gate's flag cache is one second; three is the bound on closing. */
export const CLOSE_BOUND_MS = 3000;
/**
 * Each tick is two requests bounded at 0.8 s and a 0.25 s sleep; the rest is
 * process launch time, which a host's security agent can stretch to seconds
 * (seen locally: 2-4 s gaps from an earlier, spawn-heavy observer).
 */
export const MAX_GAP_MS = 5000;

// The exact `checks.maintenance` texts the API reports (api/src/http/
// middleware/maintenance.ts). Matched by prefix and never by a word inside
// them: "schema" also appears in the migration text.
export const REASONS = {
  maintenance: 'failed: maintenance mode is on',
  migration: 'failed: a schema migration is running',
  stale: 'failed: the database schema is not this build’s',
  absent: 'failed: the database has no Studio schema',
  starting: 'failed: the server is starting',
};

/** Which reason a `checks.maintenance` value is, or `ok`, or `unknown`. */
export function reasonOf(value) {
  if (value === 'ok') return 'ok';
  for (const [name, text] of Object.entries(REASONS)) {
    if (value === text || value.startsWith(`${text}: `)) return name;
  }
  return 'unknown';
}

export function parseTicks(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [ts, readyStatus, readyBody, probeStatus, probeKind] =
        line.split('\t');
      let reason = null;
      try {
        const body = JSON.parse(readyBody);
        const value = body?.checks?.maintenance;
        if (typeof value === 'string') reason = reasonOf(value);
      } catch {
        // Not the API's JSON: Traefik's own answer while `api` is replaced.
      }
      return {
        ts: Number(ts),
        readyStatus,
        probeStatus,
        probeKind,
        // `null` when the answer did not come from the API.
        reason,
      };
    });
}

/**
 * Events are `<ms> start <n> <command>` and `<ms> end <n> <exit code>`. Steps
 * come back in order, each with the command the guide gave.
 */
export function parseSteps(text) {
  const steps = new Map();
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const [ts, kind, index, ...rest] = line.split('\t');
    const step = steps.get(index) ?? { index: Number(index) };
    if (kind === 'start') {
      step.start = Number(ts);
      step.command = rest.join('\t');
    } else if (kind === 'end') {
      step.end = Number(ts);
      step.exitCode = Number(rest[0]);
    }
    steps.set(index, step);
  }
  return [...steps.values()].sort((a, b) => a.index - b.index);
}

const isMaintenance = (state) => (step) =>
  /\bmaintenance\s+(on|off)\b/.exec(step.command ?? '')?.[1] === state;
const isMigrate = (step) => /\brun\s+--rm\s+migrate\b/.test(step.command ?? '');

function tally(ticks) {
  const count = (key) =>
    ticks.reduce((acc, tick) => {
      const value = String(tick[key] ?? 'not-the-api');
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
  return {
    ticks: ticks.length,
    reasons: count('reason'),
    readyz: count('readyStatus'),
    probe: count('probeStatus'),
    probeKind: count('probeKind'),
  };
}

export function analyseWindow(ticks, steps) {
  const failures = [];
  const evidence = {
    steps: steps.map((step) => ({
      command: step.command,
      ms: step.end - step.start,
      ...tally(
        ticks.filter((tick) => tick.ts >= step.start && tick.ts <= step.end),
      ),
    })),
  };

  const on = steps.find(isMaintenance('on'));
  const migrate = steps.find(isMigrate);
  const off = steps.find(isMaintenance('off'));
  if (!on)
    failures.push('the executed sequence never entered maintenance mode');
  if (!migrate) failures.push('the executed sequence never ran migrate');
  if (!off) failures.push('the executed sequence never left maintenance mode');
  if (!on || !migrate || !off) return { ok: false, failures, evidence };
  if (!(on.index < migrate.index && migrate.index < off.index)) {
    failures.push(
      'maintenance on, migrate and maintenance off ran out of order',
    );
  }

  const closedTick = ticks.find(
    (tick) => tick.ts >= on.start && tick.reason === 'maintenance',
  );
  if (!closedTick || closedTick.ts > on.end + CLOSE_BOUND_MS) {
    failures.push(
      `/readyz did not name maintenance mode within ${CLOSE_BOUND_MS} ms of maintenance on returning`,
    );
    return { ok: false, failures, evidence };
  }

  const window = ticks.filter(
    (tick) => tick.ts >= closedTick.ts && tick.ts < off.start,
  );
  evidence.window = {
    ms: off.start - closedTick.ts,
    closedAfterOnMs: closedTick.ts - on.end,
    ...tally(window),
  };

  for (let i = 1; i < window.length; i += 1) {
    const gap = window[i].ts - window[i - 1].ts;
    if (gap > MAX_GAP_MS) {
      failures.push(`the observer was silent for ${gap} ms inside the window`);
      break;
    }
  }
  const served = window.filter(
    (tick) => tick.readyStatus === '200' || tick.probeStatus === '200',
  );
  if (served.length > 0) {
    failures.push(
      `${served.length} tick(s) inside the window were answered 200 (first at +${served[0].ts - closedTick.ts} ms)`,
    );
  }
  // The page comes from `web`, so while `up -d` replaces `web` itself Traefik
  // has no page to serve and answers its own bare 503 (seen in the first
  // code-only run: one tick, mid-replacement). Closed either way; that step
  // is the only one where a 503 without the page is allowed.
  const replacingWeb = steps.filter((step) =>
    /\bup\s+-d\b.*\bweb\b/.test(step.command ?? ''),
  );
  const unpaged = window.filter((tick) => {
    if (tick.probeStatus !== '503') return true;
    if (tick.probeKind === 'page' || tick.probeKind === 'problem-maintenance') {
      return false;
    }
    return !replacingWeb.some(
      (step) => tick.ts >= step.start && tick.ts <= step.end,
    );
  });
  if (unpaged.length > 0) {
    failures.push(
      `${unpaged.length} probe(s) inside the window did not get the maintenance page (saw ${[
        ...new Set(unpaged.map((t) => `${t.probeStatus}/${t.probeKind}`)),
      ].join(', ')})`,
    );
  }
  const wrongReason = window.filter(
    (tick) =>
      tick.reason !== null &&
      tick.reason !== 'maintenance' &&
      tick.reason !== 'starting',
  );
  if (wrongReason.length > 0) {
    failures.push(
      `${wrongReason.length} /readyz answer(s) inside the window named ${[
        ...new Set(wrongReason.map((t) => t.reason)),
      ].join(', ')} rather than maintenance mode`,
    );
  }

  const duringMigrate = window.filter(
    (tick) =>
      tick.ts >= migrate.start &&
      tick.ts <= migrate.end &&
      tick.reason === 'maintenance',
  );
  evidence.migrateTicksNamingMaintenance = duringMigrate.length;
  if (duringMigrate.length === 0) {
    failures.push('no /readyz answer inside migrate named maintenance mode');
  }

  const after = ticks.filter((tick) => tick.ts >= off.end);
  const reopened = after.find(
    (tick) => tick.readyStatus === '200' && tick.probeStatus === '200',
  );
  if (!reopened) {
    failures.push(
      'after maintenance off, /readyz and the probe never both answered 200',
    );
  } else {
    evidence.reopenedAfterOffMs = reopened.ts - off.end;
  }

  return { ok: failures.length === 0, failures, evidence };
}

function main([observePath, eventsPath, outPath]) {
  if (!observePath || !eventsPath || !outPath) {
    console.error('usage: window.mjs <observe.tsv> <events.tsv> <out.json>');
    process.exit(64);
  }
  const result = analyseWindow(
    parseTicks(readFileSync(observePath, 'utf8')),
    parseSteps(readFileSync(eventsPath, 'utf8')),
  );
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  for (const failure of result.failures) console.error(`  FAIL  ${failure}`);
  if (result.ok) {
    const { window } = result.evidence;
    console.log(
      `  ok    closed ${window.closedAfterOnMs} ms after maintenance on; ${window.ticks} ticks over ${window.ms} ms, none served; ${result.evidence.migrateTicksNamingMaintenance} inside migrate named maintenance; reopened ${result.evidence.reopenedAfterOffMs} ms after maintenance off`,
    );
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
