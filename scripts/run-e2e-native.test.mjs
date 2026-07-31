import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const runner = new URL('./run-e2e-native.sh', import.meta.url).pathname;
const interviewDockerRunner = readFileSync(
  new URL('../packages/interview/e2e/scripts/run.sh', import.meta.url),
  'utf8',
);

test('requires a supported E2E suite', () => {
  const missing = spawnSync('bash', [runner], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Usage:/);

  const unknown = spawnSync('bash', [runner, 'unknown'], { encoding: 'utf8' });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unsupported E2E suite/);
});

test('refuses to regenerate snapshots on an arbitrary ARM64 host', () => {
  const local = spawnSync('bash', [runner, 'architect', '--update-snapshots'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_ACTIONS: 'false',
      RUNNER_OS: 'Linux',
      RUNNER_ARCH: 'ARM64',
    },
  });
  assert.notEqual(local.status, 0);
  assert.match(local.stderr, /GitHub-hosted Linux ARM64 runner/);
});

test('only local snapshot regeneration invokes the Docker wrappers', () => {
  for (const manifestPath of [
    '../apps/architect/package.json',
    '../apps/interviewer/package.json',
    '../packages/interview/package.json',
  ]) {
    const manifest = JSON.parse(
      readFileSync(new URL(manifestPath, import.meta.url), 'utf8'),
    );
    assert.doesNotMatch(manifest.scripts['test:e2e'], /e2e\/scripts\/run\.sh/);
    assert.match(
      manifest.scripts['test:e2e:update-snapshots'],
      /e2e\/scripts\/run\.sh/,
    );
    assert.match(
      manifest.scripts['test:e2e:update-snapshots'],
      /--update-snapshots=all/,
    );
  }
});

test('local Interview baseline generation defaults to one worker', () => {
  assert.match(interviewDockerRunner, /PW_WORKERS="\$\{PW_WORKERS:-1\}"/);
});
