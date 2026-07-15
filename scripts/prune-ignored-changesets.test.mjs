import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(scriptDir, 'prune-ignored-changesets.mjs');

const CONFIG = JSON.stringify({
  ignore: ['@codaco/architect', '@codaco/documentation'],
});

function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'prune-'));
  mkdirSync(join(cwd, '.changeset'));
  writeFileSync(join(cwd, '.changeset', 'config.json'), CONFIG);
  writeFileSync(join(cwd, '.changeset', 'README.md'), 'readme');
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, '.changeset', name), body);
  }
  return cwd;
}

function run(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

test('removes changesets that only release ignored packages', () => {
  const cwd = fixture({
    'docs.md': `---\n"@codaco/documentation": minor\n---\n\ndocs change`,
    'app.md': `---\n'@codaco/architect': patch\n---\n\napp change`,
  });
  const res = run(cwd);
  assert.equal(res.status, 0);
  assert.ok(!existsSync(join(cwd, '.changeset', 'docs.md')));
  assert.ok(!existsSync(join(cwd, '.changeset', 'app.md')));
  assert.match(res.stdout, /pruned \.changeset\/docs\.md/);
  assert.match(res.stdout, /pruned \.changeset\/app\.md/);
});

test('keeps changesets that release a library package', () => {
  const cwd = fixture({
    'lib.md': `---\n"@codaco/interview": minor\n---\n\nlib change`,
    'mixed.md': `---\n"@codaco/architect": minor\n"@codaco/interview": patch\n---\n\nmixed`,
  });
  const res = run(cwd);
  assert.equal(res.status, 0);
  assert.ok(existsSync(join(cwd, '.changeset', 'lib.md')));
  assert.ok(existsSync(join(cwd, '.changeset', 'mixed.md')));
  assert.match(res.stdout, /no ignored-lane changesets to prune/);
});

test('leaves README.md and empty changesets alone', () => {
  const cwd = fixture({
    'empty.md': `---\n---\n\nnote without releases`,
  });
  const res = run(cwd);
  assert.equal(res.status, 0);
  assert.ok(existsSync(join(cwd, '.changeset', 'README.md')));
  assert.ok(existsSync(join(cwd, '.changeset', 'empty.md')));
});
