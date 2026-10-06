import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

import {
  applyMasks,
  differences,
  MASKS,
  scheduledQueues,
} from '../../apps/studio/release-test/diff-export.mjs';
import {
  decide,
  laneVerdict,
  newestVersion,
  requiredRuns,
} from '../../apps/studio/release-test/previous-release.mjs';
import {
  analyseWindow,
  parseSteps,
  parseTicks,
  REASONS,
  reasonOf,
} from '../../apps/studio/release-test/window.mjs';

// The Studio release-test lane (#1901) runs only where Docker can stand the
// reference stack up — the `studio-upgrade` job, or a developer's machine —
// so its decisions are pinned here, where every pull request runs them: the
// maintenance-window oracle, the export diff and its masks, and the rule that
// a published release must be upgraded from. Each case below is a run the
// lane must refuse, built from the shapes observe.sh and upgrade.sh write.

const guide = (page) =>
  readFileSync(
    new URL(`../../apps/studio/docs/self-host/${page}`, import.meta.url),
    'utf8',
  );

/** The fenced bash block between `<!-- <name> start/end -->`, as upgrade.sh reads it. */
function guideBlock(source, name) {
  const marked = new RegExp(
    `^<!-- ${name} start -->\\n+\`\`\`bash\\n(?<body>[\\s\\S]*?)^\`\`\`\\n+<!-- ${name} end -->$`,
    'm',
  ).exec(source);
  return marked?.groups?.body.split('\n').filter((line) => line !== '');
}

test('the upgrade guide carries the block the lane executes, in the sequence the spec fixes', () => {
  const lines = guideBlock(guide('upgrade.md'), 'upgrade-sequence');
  assert.ok(lines, 'upgrade.md marks its sequence for the lane');
  assert.deepEqual(lines, [
    'docker compose run --rm --no-deps api maintenance on',
    '# take your backup now — see ./backup.md',
    'docker compose pull',
    'docker compose up -d web api worker',
    'docker compose run --rm migrate',
    'docker compose run --rm --no-deps api maintenance off',
  ]);
});

test('the backup guide marks the block the lane runs in place of the backup comment', () => {
  const lines = guideBlock(guide('backup.md'), 'backup-take');
  assert.ok(lines, 'backup.md marks its backup block');
  assert.ok(lines.some((line) => line.includes('pg_dump')));
  assert.ok(lines.some((line) => line.includes('pg_dumpall')));
  assert.ok(lines.some((line) => line.includes('studio-secrets-key')));
  // Nothing in it may name the Compose project: the lane's is not `studio`,
  // and neither is every self-hoster's.
  assert.ok(lines.every((line) => !line.includes('studio_garage-data')));
});

// ── The window oracle ─────────────────────────────────────────────────────

const ready = (reason) =>
  JSON.stringify({
    status: reason === 'ok' ? 'ok' : 'failing',
    checks: { db: 'ok', maintenance: reason },
  });

/** One observer line. */
const tick = (ts, readyStatus, readyBody, probeStatus, probeKind) =>
  [ts, readyStatus, readyBody, probeStatus, probeKind].join('\t');

const SEQUENCE = [
  'docker compose run --rm --no-deps api maintenance on',
  'backup (docs/self-host/backup.md)',
  'docker compose pull',
  'docker compose up -d web api worker',
  'docker compose run --rm migrate',
  'docker compose run --rm --no-deps api maintenance off',
];

/**
 * Steps 2 s apart, each lasting 1.8 s, from t = 2000: maintenance on is
 * 2000-3800, up -d 8000-9800, migrate 10000-11800, maintenance off
 * 12000-13800.
 */
function events(commands = SEQUENCE) {
  return commands
    .flatMap((command, index) => {
      const start = 2000 * (index + 1);
      return [
        `${start}\tstart\t${index + 1}\t${command}`,
        `${start + 1800}\tend\t${index + 1}\t0`,
      ];
    })
    .join('\n');
}

const OPEN = ready('ok');
const CLOSED = ready(REASONS.maintenance);

/**
 * A good observation of SEQUENCE, a tick every 250 ms: open before, closed
 * from 2250 (the flag lands inside maintenance on) until 13000 (inside
 * maintenance off), open after. `overrides` replaces ticks by timestamp.
 */
function observation(overrides = {}) {
  const lines = [];
  for (let ts = 1000; ts <= 15000; ts += 250) {
    let line;
    if (ts < 2250) line = tick(ts, '200', OPEN, '200', 'other');
    else if (ts < 13000) line = tick(ts, '503', CLOSED, '503', 'page');
    else line = tick(ts, '200', OPEN, '200', 'other');
    lines.push(overrides[ts] ?? line);
  }
  return lines.join('\n');
}

const analyse = (observed, stepEvents = events()) =>
  analyseWindow(parseTicks(observed), parseSteps(stepEvents));

test('a closed window, a held migrate and a reopened instance pass', () => {
  const result = analyse(observation());
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.ok(result.evidence.migrateTicksNamingMaintenance > 0);
});

test('a sequence without maintenance on is refused, and its evidence names what readiness said', () => {
  const commands = SEQUENCE.filter(
    (command) => !command.endsWith('maintenance on'),
  );
  const result = analyse(
    observation({
      // Without the flag, migrate's lock is what readiness names.
      10500: tick(10500, '503', ready(REASONS.migration), '503', 'page'),
    }),
    events(commands),
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.includes(
      'the executed sequence never entered maintenance mode',
    ),
  );
  assert.ok(result.evidence.steps.length === commands.length);
});

test('a 200 inside the window is refused', () => {
  const result = analyse(
    observation({ 6000: tick(6000, '503', CLOSED, '200', 'other') }),
  );
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /answered 200/);
});

test('readiness naming the lock or the schema inside the window is refused', () => {
  for (const reason of [REASONS.migration, REASONS.stale, REASONS.absent]) {
    const result = analyse(
      observation({ 10250: tick(10250, '503', ready(reason), '503', 'page') }),
    );
    assert.equal(result.ok, false, reason);
    assert.match(result.failures.join('\n'), /rather than maintenance mode/);
  }
  // A fresh process that has not read the flag yet is closed, not wrong.
  const starting = analyse(
    observation({
      9000: tick(9000, '503', ready(REASONS.starting), '503', 'page'),
    }),
  );
  assert.equal(starting.ok, true, starting.failures.join('\n'));
});

test('a window that never closes, or closes late, is refused', () => {
  const never = {};
  for (let ts = 2250; ts < 13000; ts += 250) {
    never[ts] = tick(ts, '503', ready(REASONS.migration), '503', 'page');
  }
  assert.equal(analyse(observation(never)).ok, false);

  // maintenance on returns at 3800; the first answer naming it is at 7250.
  const late = {};
  for (let ts = 2250; ts < 7250; ts += 250) {
    late[ts] = tick(ts, '503', '-', '503', 'page');
  }
  const result = analyse(observation(late));
  assert.equal(result.ok, false);
  assert.match(
    result.failures.join('\n'),
    /did not name maintenance mode within/,
  );
});

test('migrate with no answer from the API naming maintenance is refused', () => {
  const overrides = {};
  for (let ts = 10000; ts <= 11800; ts += 250) {
    overrides[ts] = tick(ts, '502', 'Bad Gateway', '503', 'page');
  }
  const result = analyse(observation(overrides));
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.includes(
      'no /readyz answer inside migrate named maintenance mode',
    ),
  );
});

test('a probe without the page is refused, except while web itself is replaced', () => {
  const outside = analyse(
    observation({ 6000: tick(6000, '503', CLOSED, '503', 'other') }),
  );
  assert.equal(outside.ok, false);
  assert.match(outside.failures.join('\n'), /did not get the maintenance page/);

  const during = analyse(
    observation({
      8250: tick(8250, '502', 'Bad Gateway', '000', 'other'),
      8500: tick(8500, '503', CLOSED, '503', 'other'),
    }),
  );
  assert.equal(during.ok, true, during.failures.join('\n'));
});

test('a silent observer is refused, and so is an instance that never reopens', () => {
  // Nothing between 4000 and 10000: six seconds, with migrate's ticks kept so
  // only the gap is wrong.
  const silent = analyse(
    observation()
      .split('\n')
      .filter((line) => {
        const ts = Number(line.split('\t')[0]);
        return ts < 4000 || ts >= 10000;
      })
      .join('\n'),
  );
  assert.equal(silent.ok, false);
  assert.match(silent.failures.join('\n'), /observer was silent/);

  const closedForever = {};
  for (let ts = 13000; ts <= 15000; ts += 250) {
    closedForever[ts] = tick(ts, '503', CLOSED, '503', 'page');
  }
  const stuck = analyse(observation(closedForever));
  assert.equal(stuck.ok, false);
  assert.match(stuck.failures.join('\n'), /never both answered 200/);
});

test('readiness reasons are matched exactly, never by a word inside them', () => {
  assert.equal(reasonOf('ok'), 'ok');
  assert.equal(reasonOf('failed: maintenance mode is on'), 'maintenance');
  assert.equal(
    reasonOf('failed: maintenance mode is on: Upgrading to 1.4'),
    'maintenance',
  );
  assert.equal(reasonOf('failed: a schema migration is running'), 'migration');
  assert.equal(
    reasonOf('failed: the database schema is not this build’s'),
    'stale',
  );
  assert.equal(
    reasonOf("failed: the database schema is not this build's"),
    'unknown',
  );
  assert.equal(reasonOf('failed: schema'), 'unknown');
});

// ── The export diff ───────────────────────────────────────────────────────

const exported = (tables) =>
  new Map(
    Object.entries(tables).map(([name, rows]) => [
      name,
      {
        key: ['id'],
        rows: new Map(rows.map((row) => [JSON.stringify([row.id]), row])),
      },
    ]),
  );

test('only what existed before is compared, and every loss or change is a difference', () => {
  const before = exported({
    'public.protocols': [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
    'public.teams': [{ id: 't1', name: 'Team' }],
  });
  const after = exported({
    'public.protocols': [
      // A new column is what a migration adds: not a difference.
      { id: 'p1', name: 'One', release_test_probe: 'backfilled:p1' },
      { id: 'p3', name: 'Three' },
    ],
  });
  const found = differences(before, after).map(({ kind, table, column }) =>
    [kind, table, column].filter(Boolean).join(' '),
  );
  assert.deepEqual(found.sort(), [
    'row-added public.protocols',
    'row-lost public.protocols',
    'table-lost public.teams',
  ]);

  const changed = differences(
    exported({ 'public.protocols': [{ id: 'p1', name: 'One', note: 'x' }] }),
    exported({ 'public.protocols': [{ id: 'p1', name: 'Uno' }] }),
  ).map(({ kind, column }) => `${kind} ${column}`);
  assert.deepEqual(changed.sort(), ['column-lost note', 'value-changed name']);
});

test('every mask names its reason and the run that showed the change', () => {
  assert.ok(MASKS.length > 0);
  for (const mask of MASKS) {
    assert.ok(mask.reason.length > 20, `${mask.name} says why`);
    assert.ok(mask.seen.length > 0, `${mask.name} says when it was seen`);
  }
});

test('the masks cover their own rows and nothing beside them', () => {
  const before = exported({
    'studio_jobs.jobs': [],
    'studio_jobs.job_schedules': [{ id: 'denied-attempts-summary' }],
    'public.deployment_state': [{ id: 1, maintenance: false, updated_at: 'a' }],
  });
  const after = exported({
    'studio_jobs.jobs': [
      { id: 'probe', queue: 'protocol-store-gc' },
      { id: 'cron', queue: 'denied-attempts-summary' },
      { id: 'stray', queue: 'invitation-delivery' },
    ],
    'studio_jobs.job_schedules': [
      { id: 'denied-attempts-summary', queue: 'denied-attempts-summary' },
    ],
    'public.deployment_state': [
      // Left in maintenance: the flag is compared, only its date is masked.
      { id: 1, maintenance: true, updated_at: 'b' },
    ],
  });
  const { unmasked, hits } = applyMasks(differences(before, after), MASKS, {
    probeJobId: 'probe',
    cronQueues: scheduledQueues(after),
  });
  assert.deepEqual(
    unmasked
      .map(
        ({ kind, table, column, key }) =>
          `${kind} ${table} ${column ?? key[0]}`,
      )
      .sort(),
    [
      'row-added studio_jobs.jobs stray',
      'value-changed public.deployment_state maintenance',
    ],
  );
  assert.equal(hits['the probe job'], 1);
  assert.equal(hits['a job the cron enqueued'], 1);
  assert.equal(hits['the maintenance flag date'], 1);

  // Without the probe's id, the probe row is a difference like any other.
  const unknownProbe = applyMasks(differences(before, after), MASKS, {
    probeJobId: null,
    cronQueues: scheduledQueues(after),
  });
  assert.ok(unknownProbe.unmasked.some(({ key }) => key[0] === 'probe'));
});

// ── The previous release, and the fail-closed lane ────────────────────────

const token = (status, body = { token: 't' }) => ({ status, body });

test('the previous release is read from GHCR, and doubt is never read as none', () => {
  assert.deepEqual(
    decide({
      authenticated: true,
      token: token(200),
      tags: { status: 404, body: { errors: [{ code: 'NAME_UNKNOWN' }] } },
    }).status,
    'none',
  );
  assert.equal(
    decide({ authenticated: false, token: token(403, {}), tags: null }).status,
    'none',
  );
  const published = decide({
    authenticated: true,
    token: token(200),
    tags: {
      status: 200,
      body: { tags: ['latest', '1.2.0', '1.10.0', 'sha-abc'] },
    },
  });
  assert.equal(published.status, 'published');
  assert.equal(published.newest, '1.10.0');
  assert.equal(
    decide({
      authenticated: true,
      token: token(200),
      tags: { status: 200, body: { tags: ['latest'] } },
    }).status,
    'none',
  );
  for (const doubt of [
    { authenticated: true, token: token(403, {}), tags: null },
    { authenticated: true, token: token(200), tags: { status: 500, body: '' } },
    { authenticated: false, token: token(500, {}), tags: null },
    { authenticated: true, token: token(200), tags: { status: 404, body: {} } },
  ]) {
    assert.throws(() => decide(doubt), undefined, JSON.stringify(doubt));
  }
  assert.equal(newestVersion(['0.9.9', '0.10.0', '0.2.0']), '0.10.0');
  assert.equal(newestVersion([]), null);
});

test('a published release adds run C, and the lane fails without it', () => {
  const none = { status: 'none', newest: null };
  const published = { status: 'published', newest: '1.0.0' };
  assert.deepEqual(requiredRuns(['A', 'B'], none), ['A', 'B']);
  assert.deepEqual(requiredRuns(['A', 'B'], published), ['A', 'B', 'C']);
  assert.deepEqual(requiredRuns(['C'], published), ['C']);

  const passed = (run) => ({ run, ok: true });
  assert.equal(
    laneVerdict({ release: none, runs: [passed('A'), passed('B')] }).ok,
    true,
  );
  assert.match(
    laneVerdict({ release: none, runs: [passed('A')] }).runC,
    /no migration-era release/,
  );
  // One published tag and no run C: the lane fails (#1901 S-7).
  const skipped = laneVerdict({
    release: published,
    runs: [passed('A'), passed('B')],
  });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.runC, 'did not run');
  assert.equal(
    laneVerdict({
      release: published,
      runs: [passed('A'), passed('B'), passed('C')],
    }).ok,
    true,
  );
  assert.equal(
    laneVerdict({ release: none, runs: [passed('A'), { run: 'B', ok: false }] })
      .ok,
    false,
  );
  assert.equal(laneVerdict({ release: none, runs: [] }).ok, false);
});
