import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { releaseNotes, versionsSince } from './release-notes.mjs';

const CHANGELOG = `# @codaco/interviewer

## 8.1.3

### Patch Changes

- aaa1111: Safari downloads exports directly.

## 8.1.2

### Patch Changes

- bbb2222: Dependency updates.

## 8.1.1

### Patch Changes

- ccc3333: Pedigree fixes.
`;

function appDir(changelog = CHANGELOG) {
  const dir = mkdtempSync(join(tmpdir(), 'rn-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}

const notes = (dir, version, since) =>
  releaseNotes({ appDir: dir, pkgName: '@codaco/interviewer', version, since });

test('a release that follows the previous one carries only its own section', () => {
  const body = notes(appDir(), '8.1.3', '8.1.2');
  assert.match(body, /Safari downloads exports directly/);
  assert.ok(!body.includes('Dependency updates'));
  // One section keeps the bare body, with no version heading above it.
  assert.ok(!body.startsWith('## '));
});

// A release run can be dropped while pending on its app's concurrency group,
// so the next release is the first to mention those changes and has to carry
// their sections too.
test('a release that skipped a version carries both sections, each headed', () => {
  const body = notes(appDir(), '8.1.3', '8.1.1');
  assert.match(body, /^## 8\.1\.3/);
  assert.match(body, /## 8\.1\.2/);
  assert.match(body, /Safari downloads exports directly/);
  assert.match(body, /Dependency updates/);
  // Not the one that did get released.
  assert.ok(!body.includes('Pedigree fixes'));
});

test('without a previous release, only the version at hand is described', () => {
  const body = notes(appDir(), '8.1.3', '');
  assert.match(body, /Safari downloads exports directly/);
  assert.ok(!body.includes('Dependency updates'));
});

test('versionsSince spans the gap, newest first, and never reaches past the target', () => {
  const dir = appDir();
  assert.deepEqual(versionsSince(dir, '8.1.3', '8.1.1'), ['8.1.3', '8.1.2']);
  assert.deepEqual(versionsSince(dir, '8.1.2', '8.1.1'), ['8.1.2']);
  assert.deepEqual(versionsSince(dir, '8.1.1', '8.1.0'), ['8.1.1']);
});

test('falls back to a bare line when the changelog has no such version', () => {
  assert.equal(notes(appDir(), '9.9.9', '8.1.3'), 'Release v9.9.9');
});
