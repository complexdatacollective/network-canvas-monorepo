import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'scripts',
  'resolve-hotfix-release.mjs',
);

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// A throwaway repo holding the app's package.json and `tags`. The script is
// deliberately run from OUTSIDE that tree — in the workflow it comes from a
// sparse checkout of main, because a hotfix branch cut from a release tag
// predates it — so this also pins that it reads the working directory rather
// than its own location. Returns { ok, output, stderr }.
function resolve({
  app = 'interviewer',
  version,
  tags = [],
  strandedTags = [],
}) {
  const cwd = mkdtempSync(join(tmpdir(), 'rhr-'));
  mkdirSync(join(cwd, 'apps', app), { recursive: true });
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'ci@example.com');
  git(cwd, 'config', 'user.name', 'ci');
  writeFileSync(
    join(cwd, 'apps', app, 'package.json'),
    `${JSON.stringify({ name: `@codaco/${app}`, version }, null, 2)}\n`,
  );
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'first');
  for (const tag of tags) git(cwd, 'tag', tag);

  // Tags on a commit the released tree never saw — the shape a hotfix branch
  // has when another hotfix shipped after it was cut.
  if (strandedTags.length) {
    const released = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    git(cwd, 'checkout', '-q', '-b', 'elsewhere');
    writeFileSync(join(cwd, 'apps', app, 'other.txt'), 'shipped elsewhere\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-qm', 'a release this branch never saw');
    for (const tag of strandedTags) git(cwd, 'tag', tag);
    git(cwd, 'checkout', '-q', released);
  }

  const outputPath = join(cwd, 'github-output');
  writeFileSync(outputPath, '');
  let ok = true;
  let stderr = '';
  try {
    execFileSync('node', [SCRIPT], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, APP: app, GITHUB_OUTPUT: outputPath },
    });
  } catch (error) {
    ok = false;
    stderr = String(error.stderr ?? '');
  }
  const output = Object.fromEntries(
    readFileSync(outputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=')),
  );
  return { ok, output, stderr };
}

test('clears a hotfix newer than every released tag', () => {
  const { ok, output } = resolve({
    version: '8.1.3',
    tags: ['@codaco/interviewer@8.1.1', '@codaco/interviewer@8.1.2'],
  });
  assert.ok(ok);
  assert.equal(output.version, '8.1.3');
  assert.equal(output.label, 'Interviewer');
  assert.equal(output.newest, '8.1.2');
});

test('labels architect too', () => {
  const { ok, output } = resolve({ app: 'architect', version: '7.0.1' });
  assert.ok(ok);
  assert.equal(output.label, 'Architect');
  assert.equal(output.newest, '');
});

// A dispatch is a deliberate request, so unlike the normal lane's guard every
// rejection here is a hard failure rather than a silent skip.
test('fails on a version that is already released', () => {
  const { ok, stderr } = resolve({
    version: '8.1.2',
    tags: ['@codaco/interviewer@8.1.2'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /already released/);
});

test('fails on a version older than the newest release', () => {
  const { ok, stderr } = resolve({
    version: '8.0.5',
    tags: ['@codaco/interviewer@8.1.2'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /older than the released 8\.1\.2/);
});

test('fails on a prerelease version', () => {
  const { ok, stderr } = resolve({ version: '8.1.3-beta.1' });
  assert.equal(ok, false);
  assert.match(stderr, /not a stable semver/);
});

test('fails on an app the lane does not release', () => {
  const { ok, stderr } = resolve({ app: 'fresco', version: '1.0.0' });
  assert.equal(ok, false);
  assert.match(stderr, /Unsupported app/);
});

// A higher version number is not a superset of what is live: this branch was
// cut from 8.1.2 and never saw the 8.1.3 that shipped in the meantime, so
// deploying it would take the 8.1.3 fix off production.
test('fails when the tree does not descend from the newest release', () => {
  const { ok, stderr } = resolve({
    version: '8.1.4',
    tags: ['@codaco/interviewer@8.1.2'],
    strandedTags: ['@codaco/interviewer@8.1.3'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /does not contain @codaco\/interviewer@8\.1\.3/);
});

test('clears a hotfix re-cut from the newest release', () => {
  const { ok, output } = resolve({
    version: '8.1.4',
    tags: ['@codaco/interviewer@8.1.2', '@codaco/interviewer@8.1.3'],
  });
  assert.ok(ok);
  assert.equal(output.newest, '8.1.3');
});
