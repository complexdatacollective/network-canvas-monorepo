import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-changeset-app-isolation.mjs');

function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'guard-'));
  mkdirSync(join(cwd, '.changeset'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, '.changeset', name), body);
  }
  return cwd;
}

function run(cwd) {
  return spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });
}

test('passes when normal-lane app and library releases share a changeset', () => {
  const cwd = fixture({
    'normal.md': `---\n"@codaco/architect": minor\n"@codaco/interview": minor\n---\n\nshared change`,
  });
  assert.equal(run(cwd).status, 0);
});

test('fails when a changeset mixes a separately gated product and normal package', () => {
  const cwd = fixture({
    'bad.md': `---\n"@codaco/documentation": minor\n"@codaco/interview": patch\n---\n\nmixed`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /bad\.md/);
  assert.match(res.stderr, /pnpm changeset/);
});

test('allows Architect and Interviewer in the normal release lane', () => {
  const cwd = fixture({
    'apps.md': `---\n"@codaco/architect": minor\n"@codaco/interviewer": patch\n---\n\nshared apps`,
  });
  assert.equal(run(cwd).status, 0);
});

test('fails and names the file when a changeset mixes product lanes', () => {
  const cwd = fixture({
    'coupled.md': `---\n"@codaco/documentation": minor\n"networkcanvas.com": patch\n---\n\ncoupled`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /coupled\.md/);
  assert.match(res.stderr, /independent release PR/);
  assert.match(res.stderr, /different lanes/);
});
