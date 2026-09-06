import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  distributionAncestry,
  DISTRIBUTION_TAG_PREFIX,
} from './studio-release-ancestry.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-release-ancestry-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  function git(...args) {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Joshua Melville');
  git('config', 'user.email', 'joshua@northwestern.edu');
  git('config', 'core.hooksPath', '/dev/null');
  function commit(file, body) {
    writeFileSync(join(cwd, file), body);
    git('add', '.');
    git('commit', '-qm', 'Distribution qualification fixture');
    return git('rev-parse', 'HEAD');
  }
  const initial = commit('image.txt', 'same immutable image digest');
  return {
    cwd,
    git,
    commit,
    initial,
    reserve: (source) =>
      git('tag', `${DISTRIBUTION_TAG_PREFIX}${source}`, source),
  };
}

test('the first distribution has a full source identity and a monotonic generation', (t) => {
  const f = fixture(t);
  assert.deepEqual(distributionAncestry(f.cwd), {
    status: 'ready',
    source: f.initial,
    generation: 1,
    ancestors: [],
    retry: false,
  });
});

for (const file of ['installer.mjs', 'compose.yml'])
  test(`reversed ${file}-only dispatch cannot publish after the newer combined distribution`, (t) => {
    const f = fixture(t);
    const older = f.commit(file, 'older distribution');
    const newer = f.commit(file, 'newer distribution');
    f.reserve(newer);
    assert.deepEqual(distributionAncestry(f.cwd, older), {
      status: 'superseded',
      source: older,
      conflictingRelease: newer,
    });
    assert.equal(distributionAncestry(f.cwd, newer).status, 'ready');
  });

test('an exact release retry finishes partial publication without lowering release history', (t) => {
  const f = fixture(t);
  f.reserve(f.initial);
  const result = distributionAncestry(f.cwd);
  assert.equal(result.status, 'ready');
  assert.equal(result.retry, true);
  assert.equal(result.generation, 1);
});

test('a later descendant carries every reserved distribution and increases the generation', (t) => {
  const f = fixture(t);
  f.reserve(f.initial);
  const later = f.commit('installer.mjs', 'changed installer');
  const result = distributionAncestry(f.cwd);
  assert.equal(result.source, later);
  assert.equal(result.generation, 2);
  assert.deepEqual(result.ancestors, [f.initial]);
});

test('a higher generation on a divergent branch cannot replace a released distribution', (t) => {
  const f = fixture(t);
  const released = f.commit('installer.mjs', 'released');
  f.reserve(released);
  f.git('checkout', '-qb', 'divergent', f.initial);
  f.commit('compose.yml', 'one');
  const candidate = f.commit('compose.yml', 'two');
  assert.equal(distributionAncestry(f.cwd, candidate).status, 'superseded');
});

test('a tag name claiming a different source is a verification error', (t) => {
  const f = fixture(t);
  f.git('tag', `${DISTRIBUTION_TAG_PREFIX}${'a'.repeat(40)}`, f.initial);
  assert.throws(() => distributionAncestry(f.cwd), /does not match/);
});

test('a malformed reserved distribution tag cannot be silently ignored', (t) => {
  const f = fixture(t);
  f.git('tag', `${DISTRIBUTION_TAG_PREFIX}latest`);
  assert.throws(() => distributionAncestry(f.cwd), /invalid source identity/);
});
