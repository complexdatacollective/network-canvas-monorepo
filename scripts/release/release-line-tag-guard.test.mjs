import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
  'release-line-tag-guard.sh',
);

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// A throwaway repo with one commit per entry of `releases`, each carrying that
// version in apps/<app>/package.json and tagged as the release. `extraTags`
// maps a tag name to the version whose commit it points at.
function guard({ app, tag, releases, extraTags = {}, force, envApp = app }) {
  const cwd = mkdtempSync(join(tmpdir(), 'rltg-'));
  mkdirSync(join(cwd, 'apps', app), { recursive: true });
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'ci@example.com');
  git(cwd, 'config', 'user.name', 'ci');
  for (const version of releases) {
    writeFileSync(
      join(cwd, 'apps', app, 'package.json'),
      `${JSON.stringify({ name: `@codaco/${app}`, version })}\n`,
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-qm', version);
    git(cwd, 'tag', `@codaco/${app}@${version}`);
  }
  for (const [name, version] of Object.entries(extraTags)) {
    git(cwd, 'tag', name, `@codaco/${app}@${version}`);
  }
  const outputPath = join(cwd, 'github-output');
  writeFileSync(outputPath, '');
  const result = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      APP: envApp,
      TAG: tag,
      GITHUB_OUTPUT: outputPath,
      ...(force ? { FORCE: 'true' } : {}),
    },
  });
  const output = Object.fromEntries(
    readFileSync(outputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=')),
  );
  return { ok: result.status === 0, output, stdout: result.stdout };
}

for (const app of ['architect', 'interviewer']) {
  test(`resolves the newest ${app} release on its line`, () => {
    const { ok, output } = guard({
      app,
      tag: `@codaco/${app}@8.5.0`,
      releases: ['8.4.0', '8.5.0'],
    });
    assert.ok(ok);
    assert.equal(output.version, '8.5.0');
    assert.equal(output.major, '8');
    assert.match(output.sha, /^[0-9a-f]{40}$/);
  });

  // The artefact only ever moves forward on its line.
  test(`refuses an older ${app} release on its line unless forced`, () => {
    const options = {
      app,
      tag: `@codaco/${app}@8.4.0`,
      releases: ['8.4.0', '8.5.0'],
    };
    const refused = guard(options);
    assert.equal(refused.ok, false);
    assert.match(refused.stdout, /not the newest release on the 8\.x line/);
    assert.ok(guard({ ...options, force: true }).ok);
  });
}

// A newer major does not make 8.5.0 any less the newest 8.x release.
test('scopes "newest" to the major line', () => {
  const { ok } = guard({
    app: 'interviewer',
    tag: '@codaco/interviewer@8.5.0',
    releases: ['8.5.0', '9.0.0'],
  });
  assert.ok(ok);
});

test("refuses another app's tag", () => {
  const { ok, stdout } = guard({
    app: 'architect',
    envApp: 'interviewer',
    tag: '@codaco/architect@8.5.0',
    releases: ['8.5.0'],
  });
  assert.equal(ok, false);
  assert.match(stdout, /not a @codaco\/interviewer release tag/);
});

test('refuses an app without a per-line artefact', () => {
  const { ok, stdout } = guard({
    app: 'architect',
    envApp: 'fresco',
    tag: '@codaco/architect@8.5.0',
    releases: ['8.5.0'],
  });
  assert.equal(ok, false);
  assert.match(stdout, /fresco has no per-major-line release artefact/);
});

test('refuses a tag that disagrees with its own tree', () => {
  const { ok, stdout } = guard({
    app: 'interviewer',
    tag: '@codaco/interviewer@8.6.0',
    releases: ['8.5.0'],
    extraTags: { '@codaco/interviewer@8.6.0': '8.5.0' },
  });
  assert.equal(ok, false);
  assert.match(stdout, /disagrees with the version in its own tree/);
});
