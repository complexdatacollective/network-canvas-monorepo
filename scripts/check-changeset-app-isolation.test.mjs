import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-changeset-app-isolation.mjs');

// The guard reads the ignored-app set from the Changesets config, so every
// fixture carries one that mirrors the real `ignore` list (the gated products,
// the maintenance-mode classic apps, and Background Creator).
const IGNORE = [
  '@codaco/architect-classic',
  '@codaco/interviewer-classic',
  '@codaco/documentation',
  'networkcanvas.com',
  '@codaco/architect',
  '@codaco/interviewer',
  '@codaco/background-creator',
];

function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'guard-'));
  mkdirSync(join(cwd, '.changeset'));
  writeFileSync(
    join(cwd, '.changeset', 'config.json'),
    JSON.stringify({ ignore: IGNORE }),
  );
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, '.changeset', name), body);
  }
  return cwd;
}

function run(cwd) {
  return spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });
}

test('passes when app-only and library-only changesets coexist', () => {
  const cwd = fixture({
    'a.md': `---\n"@codaco/architect": minor\n---\n\napp change`,
    'b.md': `---\n"@codaco/interview": minor\n---\n\nlib change`,
  });
  assert.equal(run(cwd).status, 0);
});

test('fails and names the file when a changeset mixes an app and a library', () => {
  const cwd = fixture({
    'bad.md': `---\n"@codaco/architect": minor\n"@codaco/interview": patch\n---\n\nmixed`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /bad\.md/);
  assert.match(res.stderr, /pnpm changeset/);
});

test('fails and names the file when a changeset mixes gated products', () => {
  const cwd = fixture({
    'coupled.md': `---\n"@codaco/architect": minor\n"networkcanvas.com": patch\n---\n\ncoupled`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /coupled\.md/);
  assert.match(res.stderr, /independent release PR/);
});

test('fails when an ignored app with no release lane is mixed with a library', () => {
  // Background Creator is ignored but is not a gated product, so it is absent
  // from GATED_PRODUCT_PACKAGES; the config-derived ignore set must still catch
  // it (`changeset version` would otherwise reject the mixed changeset).
  const cwd = fixture({
    'bgc.md': `---\n"@codaco/background-creator": minor\n"@codaco/interview": patch\n---\n\nmixed`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /bgc\.md/);
  assert.match(res.stderr, /background-creator/);
});

test('passes for an ignored app on its own', () => {
  const cwd = fixture({
    'bgc-only.md': `---\n"@codaco/background-creator": minor\n---\n\napp-only`,
  });
  assert.equal(run(cwd).status, 0);
});
