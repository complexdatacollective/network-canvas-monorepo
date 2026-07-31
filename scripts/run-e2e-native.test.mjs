import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const runner = new URL('./run-e2e-native.sh', import.meta.url).pathname;
const interviewDockerRunner = readFileSync(
  new URL('../packages/interview/e2e/scripts/run.sh', import.meta.url),
  'utf8',
);
const architectDockerRunner = readFileSync(
  new URL('../apps/architect/e2e/scripts/run.sh', import.meta.url),
  'utf8',
);
const interviewerDockerRunner = readFileSync(
  new URL('../apps/interviewer/e2e/scripts/run.sh', import.meta.url),
  'utf8',
);
const architectManifest = JSON.parse(
  readFileSync(new URL('../apps/architect/package.json', import.meta.url)),
);
const interviewerManifest = JSON.parse(
  readFileSync(new URL('../apps/interviewer/package.json', import.meta.url)),
);
const turboConfig = JSON.parse(
  readFileSync(new URL('../turbo.json', import.meta.url)),
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

test('local Interview baseline generation uses the four-worker CI setting', () => {
  assert.match(interviewDockerRunner, /PW_WORKERS="\$\{PW_WORKERS:-4\}"/);
});

test('app E2E builds explicitly disable animations', () => {
  for (const dockerRunner of [architectDockerRunner, interviewerDockerRunner]) {
    assert.match(dockerRunner, /-e VITE_DISABLE_ANIMATIONS=true/);
  }

  for (const manifest of [architectManifest, interviewerManifest]) {
    assert.match(manifest.scripts['test:e2e'], /VITE_DISABLE_ANIMATIONS=true/);
    assert.match(
      manifest.scripts['test:e2e:headed'],
      /VITE_DISABLE_ANIMATIONS=true/,
    );
  }

  assert.equal(
    (
      readFileSync(runner, 'utf8').match(
        /export VITE_DISABLE_ANIMATIONS=true/g,
      ) ?? []
    ).length,
    2,
  );

  for (const taskName of [
    '@codaco/architect#build',
    '@codaco/interviewer#build',
  ]) {
    assert.ok(
      turboConfig.tasks[taskName].env.includes('VITE_DISABLE_ANIMATIONS'),
      `${taskName} hashes the animation flag`,
    );
  }
});
