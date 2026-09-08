import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'scripts',
  'superseded-push-guard.sh',
);

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commit(cwd, file, message) {
  writeFileSync(join(cwd, file), `${message}\n`);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

// A bare "origin" with one commit on main, plus the checkout a CI job would
// have of it. Returns both and the sha the job was started for.
function scenario() {
  const root = mkdtempSync(join(tmpdir(), 'spg-'));
  const remote = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '--initial-branch=main', remote);

  const checkout = join(root, 'job');
  git(root, 'clone', '-q', remote, checkout);
  git(checkout, 'config', 'user.email', 'ci@example.com');
  git(checkout, 'config', 'user.name', 'ci');
  git(checkout, 'checkout', '-q', '-b', 'main');
  const sha = commit(checkout, 'README.md', 'first');
  git(checkout, 'push', '-q', 'origin', 'main');
  return { root, remote, checkout, sha };
}

// Someone else lands a commit on origin's main. The job's checkout is not
// fetched, so locally it still believes it holds the tip.
function advance(root, remote) {
  const other = join(root, 'other');
  git(root, 'clone', '-q', remote, other);
  git(other, 'config', 'user.email', 'dev@example.com');
  git(other, 'config', 'user.name', 'dev');
  const sha = commit(other, 'NEXT.md', 'second');
  git(other, 'push', '-q', 'origin', 'main');
  return sha;
}

function guard(checkout, env) {
  const outputPath = join(checkout, 'github-output');
  writeFileSync(outputPath, '');
  const result = spawnSync('bash', [SCRIPT], {
    cwd: checkout,
    encoding: 'utf8',
    env: {
      ...process.env,
      REF: 'refs/heads/main',
      GITHUB_OUTPUT: outputPath,
      ...env,
    },
  });
  const outputs = Object.fromEntries(
    readFileSync(outputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=')),
  );
  return { ...result, outputs };
}

test('reports current while the commit is still the branch tip', () => {
  const { checkout, sha } = scenario();
  const res = guard(checkout, { EXPECTED_SHA: sha });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.outputs.current, 'true');
});

// The reason the guard exists. The checkout has not been fetched, so any
// answer read from the local clone would still say "tip".
test('reports superseded once the remote branch moves on, without a fetch', () => {
  const { root, remote, checkout, sha } = scenario();
  const newer = advance(root, remote);
  assert.equal(git(checkout, 'rev-parse', 'origin/main'), sha);

  const res = guard(checkout, { EXPECTED_SHA: sha });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.outputs.current, 'false');
  assert.match(res.stdout, /::warning::Skipping/);
  assert.ok(res.stdout.includes(newer), 'names the commit that superseded it');
});

test('the newer commit itself is still current', () => {
  const { root, remote, checkout } = scenario();
  const newer = advance(root, remote);
  const res = guard(checkout, { EXPECTED_SHA: newer });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.outputs.current, 'true');
});

// Not being able to see the branch is an infrastructure failure, and a release
// lane that quietly never acts is worse than a red job: fail, and write no
// verdict a downstream `if:` could read as permission.
test('fails loudly when the remote cannot be listed', () => {
  const { checkout, sha } = scenario();
  const res = guard(checkout, {
    EXPECTED_SHA: sha,
    REMOTE: join(checkout, 'no-such-remote'),
  });
  assert.notEqual(res.status, 0);
  assert.equal(res.outputs.current, undefined);
  assert.match(res.stderr, /::error::Could not list refs\/heads\/main/);
});

test('fails loudly when the branch does not exist on the remote', () => {
  const { checkout, sha } = scenario();
  const res = guard(checkout, {
    EXPECTED_SHA: sha,
    REF: 'refs/heads/release',
  });
  assert.notEqual(res.status, 0);
  assert.equal(res.outputs.current, undefined);
  assert.match(res.stderr, /does not exist on origin/);
});

// A short name would make ls-remote pattern-match every ref ending in it —
// a tag called main, or a branch under another namespace — and the guard
// could read a tip that is not the branch the job was started for.
test('rejects a short ref name and a short sha', () => {
  const { checkout, sha } = scenario();
  const shortRef = guard(checkout, { EXPECTED_SHA: sha, REF: 'main' });
  assert.notEqual(shortRef.status, 0);
  assert.match(shortRef.stderr, /REF must be a full ref/);

  const shortSha = guard(checkout, { EXPECTED_SHA: sha.slice(0, 9) });
  assert.notEqual(shortSha.status, 0);
  assert.match(shortSha.stderr, /EXPECTED_SHA must be a full commit sha/);
});
