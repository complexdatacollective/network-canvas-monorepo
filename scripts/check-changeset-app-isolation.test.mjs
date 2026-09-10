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
    'normal.md': `---\n"@codaco/architect": minor\n"@codaco/fresco-ui": minor\n---\n\nshared change`,
  });
  assert.equal(run(cwd).status, 0);
});

test('fails when a bundled runtime is released without every bundling app', () => {
  // The exact miss from PR #1558: @codaco/interview released with Interviewer
  // and Fresco, but not Architect, which bundles it for preview mode.
  const cwd = fixture({
    'runtime.md': `---\n"@codaco/interview": patch\n"@codaco/interviewer": patch\n"fresco": patch\n---\n\nruntime change`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /runtime\.md/);
  assert.match(
    res.stderr,
    /@codaco\/interview is released without: @codaco\/architect/,
  );
  assert.match(res.stderr, /Add an entry for each missing app/);
});

test('passes when a bundled runtime release names every bundling app', () => {
  const cwd = fixture({
    'runtime.md': `---\n"@codaco/interview": patch\n"@codaco/architect": patch\n"@codaco/interviewer": patch\n"fresco": patch\n---\n\nruntime change`,
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

test('allows normal-lane apps to share a changeset', () => {
  const cwd = fixture({
    'apps.md': `---\n"@codaco/architect": minor\n"@codaco/background-creator": patch\n"fresco": patch\n"@codaco/interviewer": patch\n---\n\nshared apps`,
  });
  assert.equal(run(cwd).status, 0);
});

test('allows the studio packages to share a changeset within their lane', () => {
  const cwd = fixture({
    'studio.md': `---\n"@codaco/studio-server": minor\n"@codaco/studio-rpc": patch\n"@codaco/studio-sync": patch\n---\n\nstudio change`,
  });
  assert.equal(run(cwd).status, 0);
});

test('fails when a changeset mixes a studio package with the normal lane', () => {
  const cwd = fixture({
    'mixed-studio.md': `---\n"@codaco/studio-server": minor\n"@codaco/protocol-validation": patch\n---\n\nmixed`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /mixed-studio\.md/);
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

test('fails when a changeset names a workspace that is never released', () => {
  // `changeset version` accepts this one: `privatePackages.version` is true and
  // the package is not in the config `ignore` list, so it would be bumped and
  // given a CHANGELOG in the normal Version Packages PR — announcing a release
  // of something nobody can install.
  const cwd = fixture({
    'private-package.md': `---\n"@codaco/protocol-builder": patch\n---\n\nprivate package`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /private-package\.md/);
  assert.match(res.stderr, /never released: @codaco\/protocol-builder/);
});

test('fails when a never-released package rides along with a normal-lane app', () => {
  // The realistic shape: the package is added beside the app that consumes it,
  // where nothing else in the guard has an opinion about it.
  const cwd = fixture({
    'ride-along.md': `---\n"@codaco/architect": minor\n"@codaco/protocol-builder": minor\n---\n\nadoption`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /ride-along\.md/);
  assert.match(res.stderr, /never released: @codaco\/protocol-builder/);
});

test('fails when a changeset names the never-released core half', () => {
  // The half #1842 split out. It arrived with no CHANGELOG, no publishConfig
  // and no lane, exactly like the package it came from, so a changeset naming
  // it is the same announcement of a release nobody can install — but it
  // inherited none of the protection, and a list naming only the original
  // would have let this one through.
  //
  // Anchored at the end of the line because `@codaco/protocol-builder` is a
  // prefix of this name: an unanchored match would be satisfied by the guard
  // reporting the other half instead.
  const cwd = fixture({
    'core-package.md': `---\n"@codaco/protocol-builder-core": patch\n---\n\ncore package`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /core-package\.md/);
  assert.match(res.stderr, /never released: @codaco\/protocol-builder-core$/m);
});

test('fails when a changeset names a tooling workspace nothing releases', () => {
  // Nothing about `@codaco/protocol-builder` is special here: every workspace
  // that is private, unpublished, carries no CHANGELOG and sits in no gated
  // lane is refused, because `changeset version` would bump every one of them
  // the same way. A hand-written list of names would have let this through.
  const cwd = fixture({
    'tooling.md': `---\n"@codaco/tsconfig": patch\n---\n\nshared tsconfig`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /tooling\.md/);
  assert.match(res.stderr, /never released: @codaco\/tsconfig$/m);
});

test('names both halves when one changeset releases the pair', () => {
  const cwd = fixture({
    'both-halves.md': `---\n"@codaco/protocol-builder": minor\n"@codaco/protocol-builder-core": minor\n---\n\nsplit`,
  });
  const res = run(cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /both-halves\.md/);
  assert.match(
    res.stderr,
    /never released: @codaco\/protocol-builder, @codaco\/protocol-builder-core$/m,
  );
});
