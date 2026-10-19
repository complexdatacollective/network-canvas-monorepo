import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
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
  mirrorVersion,
  scope,
}) {
  const cwd = mkdtempSync(join(tmpdir(), 'rhr-'));
  mkdirSync(join(cwd, 'apps', app), { recursive: true });
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'ci@example.com');
  git(cwd, 'config', 'user.name', 'ci');
  // Fresco's package is the bare `fresco`; the Netlify apps are scoped.
  const name = app === 'fresco' ? 'fresco' : `@codaco/${app}`;
  writeFileSync(
    join(cwd, 'apps', app, 'package.json'),
    `${JSON.stringify({ name, version }, null, 2)}\n`,
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
      env: {
        ...process.env,
        APP: app,
        GITHUB_OUTPUT: outputPath,
        ...(mirrorVersion ? { MIRROR_VERSION: mirrorVersion } : {}),
        ...(scope ? { SCOPE: scope } : {}),
      },
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
  assert.equal(output.package, '@codaco/interviewer');
  assert.equal(output.tag, '@codaco/interviewer@8.1.3');
  assert.equal(output.newest, '8.1.2');
  assert.equal(output.newest_tag, '@codaco/interviewer@8.1.2');
});

// Fresco tags carry the bare package name (`fresco@4.1.4`), because the app
// releases by mirroring rather than publishing under the scope. The tag the
// lane claims, and the one it reports as newest, must use that form — a
// scoped `@codaco/fresco@…` tag would be one the normal lane never looks for.
test('clears a Fresco hotfix and names its bare-package tags', () => {
  const { ok, output } = resolve({
    app: 'fresco',
    version: '4.1.5',
    tags: ['fresco@4.1.3', 'fresco@4.1.4'],
  });
  assert.ok(ok);
  assert.equal(output.label, 'Fresco');
  assert.equal(output.package, 'fresco');
  assert.equal(output.tag, 'fresco@4.1.5');
  assert.equal(output.newest, '4.1.4');
  assert.equal(output.newest_tag, 'fresco@4.1.4');
});

test('reads only bare-package tags for Fresco', () => {
  const { ok, stderr } = resolve({
    app: 'fresco',
    version: '4.1.5',
    tags: ['fresco@4.1.5'],
    strandedTags: ['@codaco/fresco@9.9.9'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /fresco@4\.1\.5 is already released/);
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

// The Fresco repository is what is live, and the normal lane pushes it before
// it tags here: a mirror ahead of the tags means a release the tags do not
// record, which a hotfix cut from the newest tag would append older code over.
test('refuses a Fresco hotfix while the mirror is ahead of the tags', () => {
  for (const version of ['4.1.5', '4.1.6']) {
    const { ok, stderr } = resolve({
      app: 'fresco',
      version,
      tags: ['fresco@4.1.4'],
      mirrorVersion: '4.1.5',
    });
    assert.equal(ok, false, version);
    assert.match(
      stderr,
      /carries 4\.1\.5 but the newest fresco@ tag here is 4\.1\.4: a release was pushed without its tag/,
    );
  }
});

test('clears a Fresco hotfix when the mirror matches the newest tag', () => {
  const { ok, output } = resolve({
    app: 'fresco',
    version: '4.1.5',
    tags: ['fresco@4.1.4'],
    mirrorVersion: '4.1.4',
  });
  assert.equal(ok, true);
  assert.equal(output.tag, 'fresco@4.1.5');
});

test('fails on a prerelease version', () => {
  const { ok, stderr } = resolve({ version: '8.1.3-beta.1' });
  assert.equal(ok, false);
  assert.match(stderr, /not a stable semver/);
});

test('fails on an app the lane does not release', () => {
  const { ok, stderr } = resolve({ app: 'documentation', version: '1.0.0' });
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

// An older line is released only by the Architect maintenance lane; the
// hotfix refusal has to say where to go instead of only what is wrong.
test('points an older Architect line at the maintenance lane', () => {
  const { ok, stderr } = resolve({
    app: 'architect',
    version: '8.5.1',
    tags: ['@codaco/architect@8.5.0', '@codaco/architect@9.0.0'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /older than the released 9\.0\.0/);
  assert.match(stderr, /Architect Maintenance Release workflow/);
});

// SCOPE=line: the Architect maintenance lane for an older major line. The
// newer line's release lives on a commit the maintenance branch never saw,
// which is the shape it has in the repository: 9.x is released from main,
// 8.x from a branch cut from the last 8.x tag.
test('line scope clears an 8.x patch alongside a released 9.0.0', () => {
  const { ok, output } = resolve({
    app: 'architect',
    scope: 'line',
    version: '8.5.1',
    tags: ['@codaco/architect@8.4.0', '@codaco/architect@8.5.0'],
    strandedTags: ['@codaco/architect@9.0.0', '@codaco/architect@9.1.0'],
  });
  assert.ok(ok);
  assert.equal(output.version, '8.5.1');
  assert.equal(output.tag, '@codaco/architect@8.5.1');
  // The previous release on the line, for release-notes.mjs --since.
  assert.equal(output.newest, '8.5.0');
  assert.equal(output.newest_tag, '@codaco/architect@8.5.0');
});

// A maintenance tag that became the newest overall would leave production
// behind its newest tag, and app-release-guard.sh would skip every later
// release from main.
test('line scope refuses a version on the newest major line', () => {
  for (const [version, tags] of [
    ['9.0.1', ['@codaco/architect@9.0.0']],
    // Before 9.0 ships, 8.x is still the newest line.
    ['8.5.1', ['@codaco/architect@8.5.0']],
  ]) {
    const { ok, stderr } = resolve({
      app: 'architect',
      scope: 'line',
      version,
      tags,
    });
    assert.equal(ok, false, version);
    assert.match(stderr, /is on the newest Architect line/);
    assert.match(stderr, /normal lane or the Hotfix Release workflow/);
  }
});

test('line scope refuses a version not newer than the newest on its line', () => {
  const { ok, stderr } = resolve({
    app: 'architect',
    scope: 'line',
    version: '8.4.9',
    tags: ['@codaco/architect@8.5.0'],
    strandedTags: ['@codaco/architect@9.0.0'],
  });
  assert.equal(ok, false);
  assert.match(
    stderr,
    /8\.4\.9 is not newer than 8\.5\.0, the newest 8\.x release/,
  );
});

test('line scope still refuses a version that is already released', () => {
  const { ok, stderr } = resolve({
    app: 'architect',
    scope: 'line',
    version: '8.5.0',
    tags: ['@codaco/architect@8.5.0'],
    strandedTags: ['@codaco/architect@9.0.0'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /already released/);
});

// 8.5.1 shipped from another maintenance branch after this one was cut from
// 8.5.0: releasing 8.5.2 from here would drop the 8.5.1 fix from the line.
test('line scope refuses a tree that does not descend from the line newest', () => {
  const { ok, stderr } = resolve({
    app: 'architect',
    scope: 'line',
    version: '8.5.2',
    tags: ['@codaco/architect@8.5.0'],
    strandedTags: ['@codaco/architect@8.5.1', '@codaco/architect@9.0.0'],
  });
  assert.equal(ok, false);
  assert.match(
    stderr,
    /does not contain @codaco\/architect@8\.5\.1, the newest 8\.x release/,
  );
});

test('line scope refuses a line that has never been released', () => {
  const { ok, stderr } = resolve({
    app: 'architect',
    scope: 'line',
    version: '7.0.1',
    strandedTags: ['@codaco/architect@9.0.0'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /has no 7\.x release to maintain/);
});

test('line scope is Architect only', () => {
  const { ok, stderr } = resolve({
    scope: 'line',
    version: '8.1.3',
    tags: ['@codaco/interviewer@8.1.2'],
    strandedTags: ['@codaco/interviewer@9.0.0'],
  });
  assert.equal(ok, false);
  assert.match(stderr, /Interviewer has no older line to maintain/);
});

test('fails on an unknown scope', () => {
  const { ok, stderr } = resolve({
    app: 'architect',
    scope: 'major',
    version: '8.5.1',
  });
  assert.equal(ok, false);
  assert.match(stderr, /Unsupported SCOPE 'major'/);
});
