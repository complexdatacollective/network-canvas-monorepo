import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const environmentUrl = new URL(
  '../.codex/environments/environment.toml',
  import.meta.url,
);
const setupUrl = new URL('../.codex/scripts/setup.sh', import.meta.url);
const cleanupUrl = new URL('../.codex/scripts/cleanup.sh', import.meta.url);

const environment = readFileSync(environmentUrl, 'utf8');
const setup = readFileSync(setupUrl, 'utf8');
const cleanup = readFileSync(cleanupUrl, 'utf8');

test('the Codex environment delegates to the checked-in lifecycle scripts', () => {
  assert.match(
    environment,
    /bash "\$CODEX_WORKTREE_PATH\/\.codex\/scripts\/setup\.sh"/,
  );
  assert.match(
    environment,
    /bash "\$CODEX_WORKTREE_PATH\/\.codex\/scripts\/cleanup\.sh"/,
  );
});

test('setup installs reproducibly without running a build', () => {
  assert.match(
    setup,
    /corepack pnpm install --frozen-lockfile --prefer-offline/,
  );
  assert.doesNotMatch(setup, /\b(?:pnpm|turbo)\b.*\bbuild\b/);
});

test('cleanup leaves caches shared by concurrent worktrees intact', () => {
  assert.doesNotMatch(cleanup, /\bpnpm\s+store\s+prune\b/);
  assert.doesNotMatch(cleanup, /\bturbo\s+daemon\b/);
  assert.doesNotMatch(cleanup, /\brm\s+-rf\b/);
});

for (const scriptUrl of [setupUrl, cleanupUrl]) {
  test(`${scriptUrl.pathname.split('/').at(-1)} has valid Bash syntax`, () => {
    const result = spawnSync('bash', ['-n', fileURLToPath(scriptUrl)], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
  });
}
