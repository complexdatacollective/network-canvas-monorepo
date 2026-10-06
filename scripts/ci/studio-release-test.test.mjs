import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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
    '# wait until /readyz names maintenance mode — see step 2',
    'docker compose stop api worker',
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

test('the restore block ends by reopening the instance, after starting the release .env names', () => {
  const lines = guideBlock(guide('backup.md'), 'backup-restore');
  assert.ok(lines, 'backup.md marks its restore block for the lane');
  // A backup taken during an upgrade carries the flag, so the restore must
  // clear it, and only once the release's containers are started.
  assert.equal(
    lines.at(-1),
    'docker compose run --rm --no-deps api maintenance off',
  );
  assert.equal(lines.at(-2), 'docker compose up -d web api worker');
  assert.ok(lines.some((line) => line.includes('pg_restore')));
  // Run by the lane as one script: nothing in it may need a real hostname.
  assert.ok(lines.every((line) => !/\bstudio\.example\.org\b/.test(line)));
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

// The guide's sequence as upgrade.sh records it, less the two steps the
// oracle never reads (the /readyz wait and `pull`).
const SEQUENCE = [
  'docker compose run --rm --no-deps api maintenance on',
  'docker compose stop api worker',
  'backup (docs/self-host/backup.md)',
  'docker compose up -d web api worker',
  'docker compose run --rm migrate',
  'docker compose run --rm --no-deps api maintenance off',
];

/**
 * Steps 2 s apart, each lasting 1.8 s, from t = 2000: maintenance on is
 * 2000-3800, stop 4000-5800, backup 6000-7800, up -d 8000-9800, migrate
 * 10000-11800, maintenance off 12000-13800.
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
  assert.ok(result.evidence.migrateTicks > 0);
  assert.ok(result.evidence.newApiTicksNamingMaintenance > 0);
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

// Seen on a CI runner: a code-only migrate runs entirely while the api up -d
// started is still booting, so Traefik answers every tick. Closed, and the
// new api is seen closed once it is up, before maintenance off.
test('a migrate the new api had not come up for passes when the new api is seen closed before maintenance off', () => {
  const overrides = {};
  for (let ts = 8000; ts <= 11800; ts += 250) {
    overrides[ts] = tick(ts, '502', 'Bad Gateway', '503', 'page');
  }
  // The lane's wait for the new api, between migrate (ends 11800) and
  // maintenance off (starts 12000).
  const lines = observation(overrides).split('\n');
  const at = lines.findIndex((line) => line.startsWith('12000\t'));
  lines.splice(at, 0, tick(11900, '503', CLOSED, '503', 'page'));
  const result = analyse(lines.join('\n'));
  assert.deepEqual(result.failures, []);
  assert.equal(result.evidence.migrateTicksNamingMaintenance, 0);
  assert.equal(result.evidence.newApiTicksNamingMaintenance, 1);
});

test('a new api never seen closed before maintenance off is refused', () => {
  const overrides = {};
  for (let ts = 8000; ts < 13000; ts += 250) {
    overrides[ts] = tick(ts, '502', 'Bad Gateway', '503', 'page');
  }
  const result = analyse(observation(overrides));
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.includes(
      'the api up -d started never answered /readyz naming maintenance mode before maintenance off',
    ),
  );
});

test('a migrate the observer took no reading of is refused', () => {
  const kept = observation()
    .split('\n')
    .filter((line) => {
      const ts = Number(line.split('\t')[0]);
      return ts < 10000 || ts > 11800;
    })
    .join('\n');
  const result = analyse(kept);
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.includes('the observer took no reading while migrate ran'),
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

  // The allowance is that answer only: a 503 or no answer with no body the
  // observer recognises. Anything else answering while web is replaced is
  // refused there as anywhere in the window.
  for (const [status, kind] of [
    ['500', 'other'],
    ['401', 'other'],
    ['404', 'other'],
    ['502', 'other'],
  ]) {
    const other = analyse(
      observation({ 8500: tick(8500, '503', CLOSED, status, kind) }),
    );
    assert.equal(other.ok, false, `${status}/${kind} during up -d`);
    assert.match(
      other.failures.join('\n'),
      new RegExp(
        `did not get the maintenance page \\(saw ${status}/${kind}\\)`,
      ),
    );
  }
});

// Seen in run B, 6 Oct 2026: the guide's wait saw the flag and the stop took
// the api down before the observer's next tick, so no reading showed the old
// release closed. Here the first reading naming maintenance mode comes inside
// the stop (4000-5800) — within the close bound, but after the api it reads
// may already be the one Traefik answers for.
test('a window first seen closed only after stop api worker started is refused', () => {
  const overrides = {};
  for (let ts = 2250; ts < 4250; ts += 250) {
    overrides[ts] = tick(ts, '503', ready(REASONS.starting), '503', 'page');
  }
  const late = analyse(observation(overrides));
  assert.equal(late.ok, false);
  assert.deepEqual(late.failures, [
    'the observer did not see the old release name maintenance mode before stop api worker',
  ]);

  // The same observation, closed at 3750 instead — before the stop — passes.
  delete overrides[3750];
  assert.deepEqual(analyse(observation(overrides)).failures, []);
});

// Seen in every lane run while `stop api worker` has `api` down, through the
// backup and `pull`: Traefik's error middleware gives the probe the page with
// 503, and `/readyz` — which no page sits in front of — Traefik's own bare
// 502. That is the answer the rule already accepts, so the stopped api gets no
// allowance of its own: a probe without the page there fails as anywhere.
test('a stopped api is closed when the probe gets the page, and refused when it does not', () => {
  const stopped = {};
  for (let ts = 4250; ts < 8000; ts += 250) {
    stopped[ts] = tick(ts, '502', 'Bad Gateway', '503', 'page');
  }
  const paged = analyse(observation(stopped));
  assert.deepEqual(paged.failures, []);
  assert.equal(
    paged.evidence.steps[1].command,
    'docker compose stop api worker',
  );
  assert.deepEqual(paged.evidence.steps[1].probeKind, { page: 8 });

  for (const [ts, status, kind] of [
    [4500, '503', 'other'], // inside the stop
    [6500, '000', 'other'], // inside the backup
    [5000, '502', 'other'],
  ]) {
    const unpaged = analyse(
      observation({
        ...stopped,
        [ts]: tick(ts, '502', 'Bad Gateway', status, kind),
      }),
    );
    assert.equal(unpaged.ok, false, `${status}/${kind} at ${ts}`);
    assert.match(
      unpaged.failures.join('\n'),
      new RegExp(
        `did not get the maintenance page \\(saw ${status}/${kind}\\)`,
      ),
    );
  }
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

/** `events()` with maintenance off moved to start at `offStart`. */
function eventsWithOffAt(offStart) {
  const off = SEQUENCE.length;
  return events()
    .split('\n')
    .map((line) => {
      const [, kind, index, ...rest] = line.split('\t');
      if (Number(index) !== off) return line;
      const at = kind === 'start' ? offStart : offStart + 1800;
      return [at, kind, index, ...rest].join('\t');
    })
    .join('\n');
}

/**
 * The fixture's ticks up to `lastClosed` (closed from 2250, so migrate is
 * watched), then nothing until the instance is open again from `reopenAt`.
 */
function observationEndingAt(lastClosed, reopenAt) {
  const lines = observation()
    .split('\n')
    .filter((line) => Number(line.split('\t')[0]) <= lastClosed);
  for (let ts = reopenAt; ts <= reopenAt + 1000; ts += 250) {
    lines.push(tick(ts, '200', OPEN, '200', 'other'));
  }
  return lines.join('\n');
}

test('an observer that stalls before maintenance off is refused, though every gap between its ticks is short', () => {
  // The last tick is at 11750 (inside migrate) and maintenance off starts at
  // 18000: 6250 ms with no reading, and no two ticks further apart than
  // 250 ms.
  const stalled = analyse(
    observationEndingAt(11750, 20000),
    eventsWithOffAt(18000),
  );
  assert.equal(stalled.ok, false);
  assert.deepEqual(stalled.failures, [
    'the observer was silent for 6250 ms inside the window (from +9500 ms until maintenance off started)',
  ]);

  // The same tail inside the bound — 4750 ms — passes: the rule is the
  // bound, not "a tick right before maintenance off".
  const within = analyse(
    observationEndingAt(11750, 18500),
    eventsWithOffAt(16500),
  );
  assert.deepEqual(within.failures, []);

  // And the fixture's own tail, 250 ms, passes.
  assert.deepEqual(analyse(observationEndingAt(11750, 14000)).failures, []);
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
    // A table the upgrade created is not a difference; a row in it is.
    'public.created_empty': [],
    'public.created_filled': [{ id: 'c1', name: 'Inserted by the backfill' }],
  });
  const found = differences(before, after).map(({ kind, table, column }) =>
    [kind, table, column].filter(Boolean).join(' '),
  );
  assert.deepEqual(found.sort(), [
    'row-added public.created_filled',
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

test('the previous release is the newest @codaco/studio-api@x.y.z tag, and nothing else counts', () => {
  assert.equal(newestVersion([]), null);
  assert.equal(
    newestVersion([
      '@codaco/studio-api@0.9.9',
      '@codaco/studio-api@0.10.0',
      '@codaco/studio-api@0.2.0',
    ]),
    '0.10.0',
  );
  // A prerelease, another package's tag and a bare version are not releases.
  assert.equal(
    newestVersion([
      '@codaco/studio-api@2.0.0-rc.1',
      '@codaco/studio-web@3.0.0',
      '9.9.9',
      'studio-api@4.0.0',
    ]),
    null,
  );

  const none = decide(['@codaco/studio-web@1.0.0']);
  assert.equal(none.status, 'none');
  assert.equal(none.tag, null);
  assert.match(none.detail, /no migration-era Studio release/);

  const published = decide([
    '@codaco/studio-api@1.2.0',
    '@codaco/studio-api@1.10.0',
  ]);
  assert.equal(published.status, 'published');
  assert.equal(published.newest, '1.10.0');
  assert.equal(published.tag, '@codaco/studio-api@1.10.0');
  assert.match(
    published.detail,
    /ghcr\.io\/complexdatacollective\/studio-api:1\.10\.0/,
  );
});

/**
 * Runs previous-release.mjs against a throwaway repository carrying `tags`,
 * with `fetch` replaced by one that fails the run: the answer must come from
 * git alone, never from a registry.
 */
function previousReleaseIn(tags) {
  const repo = mkdtempSync(join(tmpdir(), 'studio-previous-release-'));
  try {
    const git = (...args) =>
      execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'ci@example.org');
    git('config', 'user.name', 'CI');
    git('commit', '-q', '--allow-empty', '-m', 'base');
    for (const tag of tags) git('tag', tag);
    const noNetwork =
      'data:text/javascript,globalThis.fetch=()=>{throw new Error("previous-release.mjs asked the network")}';
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        noNetwork,
        fileURLToPath(
          new URL(
            '../../apps/studio/release-test/previous-release.mjs',
            import.meta.url,
          ),
        ),
        repo,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test('previous-release.mjs answers from the repository tags without asking any registry', () => {
  const none = previousReleaseIn([]);
  assert.equal(none.status, 'none');
  assert.equal(
    laneVerdict({ release: none, runs: [{ run: 'A', ok: true }] }).runC,
    'not applicable: no migration-era release is published (no @codaco/studio-api@<x.y.z> tag), so there is no published upgrade path to test',
  );

  const published = previousReleaseIn([
    '@codaco/studio-api@1.0.0',
    '@codaco/studio-api@1.1.0',
  ]);
  assert.equal(published.status, 'published');
  assert.equal(published.tag, '@codaco/studio-api@1.1.0');
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
