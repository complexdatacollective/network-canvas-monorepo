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
  'detect-app-release.sh',
);

const DEFAULT_PKG_NAME = '@codaco/interviewer';
const DEFAULT_PKG_JSON = 'apps/interviewer/package.json';

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// A throwaway git repo with the app's package.json committed at `version`.
// `tags` are created pointing at HEAD so the script's tag-existence check sees
// them. Returns the parsed `$GITHUB_OUTPUT` the script wrote.
function detect({
  version,
  previousVersion,
  tags = [],
  pkgName = DEFAULT_PKG_NAME,
  pkgJson = DEFAULT_PKG_JSON,
  releaseChannel,
}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dar-'));
  mkdirSync(join(cwd, dirname(pkgJson)), { recursive: true });
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'ci@example.com');
  git(cwd, 'config', 'user.name', 'ci');

  const writePkg = (v) =>
    writeFileSync(
      join(cwd, pkgJson),
      `${JSON.stringify({ name: pkgName, version: v, private: true }, null, 2)}\n`,
    );

  // Two commits give the repo real history. The script is tag-driven and never
  // reads the previous commit, so `previousVersion` is deliberately ignored by
  // it — the point is to prove detection does NOT depend on a HEAD^ diff (which
  // is what used to lose releases). Setting previousVersion === version below
  // reproduces a later push where the bump commit has already scrolled past.
  writePkg(previousVersion ?? version);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'first');

  writePkg(version);
  git(cwd, 'add', '.');
  // --allow-empty so the no-delta cases (previousVersion === version) still
  // produce a second commit whose tree is unchanged from the first.
  git(cwd, 'commit', '-q', '--allow-empty', '-m', 'second');

  for (const tag of tags) git(cwd, 'tag', tag);

  const output = join(cwd, 'github-output');
  writeFileSync(output, '');
  execFileSync('bash', [SCRIPT], {
    cwd,
    env: {
      ...process.env,
      PKG_JSON: pkgJson,
      PKG_NAME: pkgName,
      RELEASE_CHANNEL: releaseChannel,
      GITHUB_OUTPUT: output,
    },
    stdio: 'pipe',
  });

  return Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=')),
  );
}

test('releases a beta whose tag does not exist yet', () => {
  const out = detect({
    previousVersion: '8.0.0-beta.1',
    version: '8.0.0-beta.2',
  });
  assert.equal(out.version, '8.0.0-beta.2');
  assert.equal(out.released, 'true');
});

test('is idempotent: does not re-release when the tag already exists', () => {
  const out = detect({
    previousVersion: '8.0.0-beta.1',
    version: '8.0.0-beta.2',
    tags: [`${DEFAULT_PKG_NAME}@8.0.0-beta.2`],
  });
  assert.equal(out.released, 'false');
});

// The regression this fixes: a version bump whose release CI run was dropped
// (e.g. cancelled by concurrency) leaves the tag missing while later pushes see
// no HEAD^ delta. The release must still be picked up, not lost forever.
test('self-heals: releases when the bump has no HEAD^ delta but the tag is missing', () => {
  const out = detect({
    previousVersion: '8.0.0-beta.2',
    version: '8.0.0-beta.2',
  });
  assert.equal(out.released, 'true');
});

test('does not release the initial beta.0 seed', () => {
  const out = detect({
    previousVersion: '8.0.0-beta.0',
    version: '8.0.0-beta.0',
  });
  assert.equal(out.released, 'false');
});

test('does not release a non-beta version', () => {
  const out = detect({ previousVersion: '6.6.0', version: '6.6.0' });
  assert.equal(out.released, 'false');
});

test('does not re-release a tagged stable documentation version', () => {
  const pkgName = '@codaco/documentation';
  const out = detect({
    previousVersion: '0.1.0',
    version: '0.1.1',
    tags: [`${pkgName}@0.1.1`],
    pkgName,
    pkgJson: 'apps/documentation/package.json',
    releaseChannel: 'stable',
  });
  assert.equal(out.released, 'false');
});

test('releases a stable website version changed by its release PR', () => {
  const out = detect({
    previousVersion: '0.1.1',
    version: '0.1.2',
    pkgName: 'networkcanvas.com',
    pkgJson: 'apps/networkcanvas.com/package.json',
    releaseChannel: 'stable',
  });
  assert.equal(out.version, '0.1.2');
  assert.equal(out.released, 'true');
});

test('does not deploy an unchanged stable website version', () => {
  const out = detect({
    previousVersion: '0.1.1',
    version: '0.1.1',
    pkgName: 'networkcanvas.com',
    pkgJson: 'apps/networkcanvas.com/package.json',
    releaseChannel: 'stable',
  });
  assert.equal(out.released, 'false');
});
