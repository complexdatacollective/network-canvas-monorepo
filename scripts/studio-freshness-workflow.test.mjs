import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parse } from 'yaml';

const workflow = parse(
  readFileSync(
    new URL('../.github/workflows/ci-and-release.yml', import.meta.url),
    'utf8',
  ),
);
const job = workflow.jobs['version-packages-freshness'];
const shell = job.steps.find(({ id }) => id === 'head').run;

function run(
  t,
  {
    event = 'merge_group',
    branch = '',
    heads = {},
    comparisons = {},
    fail = false,
  } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-freshness-workflow-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const output = join(cwd, 'output');
  writeFileSync(output, '');
  writeFileSync(
    join(cwd, 'gh'),
    `#!${process.execPath}\nconst [,,command,path]=process.argv; if(command !== 'api') process.exit(3); if(process.env.FIXTURE_FAIL === 'true') process.exit(2); const heads=JSON.parse(process.env.FIXTURE_HEADS); const comparisons=JSON.parse(process.env.FIXTURE_COMPARISONS); if(path.includes('/pulls?')) { const lane=path.split('changeset-release/')[1]; process.stdout.write(heads[lane] ?? ''); } else { const head=path.split('/compare/')[1]?.split('...')[0]; if(!Object.hasOwn(comparisons,head)) process.exit(4); process.stdout.write(comparisons[head]); }\n`,
    { mode: 0o755 },
  );
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', shell], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      PATH: `${cwd}:${process.env.PATH}`,
      EVENT_NAME: event,
      PR_HEAD_REF: branch,
      GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: 'owner/repository',
      GITHUB_REPOSITORY_OWNER: 'owner',
      GITHUB_SHA: 'queue-commit',
      FIXTURE_HEADS: JSON.stringify(heads),
      FIXTURE_COMPARISONS: JSON.stringify(comparisons),
      FIXTURE_FAIL: String(fail),
    },
  });
  return {
    ...result,
    outputs: Object.fromEntries(
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=')),
    ),
  };
}

for (const lane of ['main', 'studio'])
  test(`the ${lane} release PR requests its own freshness check`, (t) => {
    const result = run(t, {
      event: 'pull_request',
      branch: `changeset-release/${lane}`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.outputs[lane], 'true');
    assert.equal(result.outputs.release_pr, 'true');
  });

test('a queue batch including both release heads checks both lanes', (t) => {
  const result = run(t, {
    heads: { main: 'normal', studio: 'studio' },
    comparisons: { normal: 'ahead', studio: 'identical' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.outputs, {
    main: 'true',
    studio: 'true',
    release_pr: 'true',
  });
});

test('an unrelated queue entry runs no freshness check', (t) => {
  const result = run(t, {
    heads: { main: 'normal', studio: 'studio' },
    comparisons: { normal: 'diverged', studio: 'behind' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.outputs, {
    main: 'false',
    studio: 'false',
    release_pr: 'false',
  });
});

test('an unavailable GitHub comparison fails instead of skipping both checks', (t) => {
  const result = run(t, { fail: true });
  assert.notEqual(result.status, 0);
  assert.notEqual(result.outputs.release_pr, 'false');
});

test('an unknown comparison response cannot be treated as an unrelated queue entry', (t) => {
  const result = run(t, {
    heads: { studio: 'studio' },
    comparisons: { studio: 'unknown' },
  });
  assert.notEqual(result.status, 0);
  assert.notEqual(result.outputs.release_pr, 'false');
});
