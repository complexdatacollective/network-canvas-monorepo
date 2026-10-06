import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { test } from 'vitest';

import { workspaceManifests } from '../release/changeset-app-utils.mjs';

const REPO_ROOT = new URL('../../', import.meta.url);

const staticPrefix = (glob) => {
  const wildcard = glob.search(/[*?{[]/u);
  return wildcard === -1 ? glob : glob.slice(0, wildcard);
};

const readCommentedJson = (name) =>
  JSON.parse(
    readFileSync(new URL(name, REPO_ROOT), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n'),
  );

test('every package-scoped turbo task names a workspace', () => {
  const workspaces = new Set(
    workspaceManifests().map(({ manifest }) => manifest.name),
  );
  const scoped = Object.keys(readCommentedJson('turbo.json').tasks)
    .filter((key) => key.includes('#') && !key.startsWith('//#'))
    .map((key) => key.slice(0, key.indexOf('#')));
  assert.ok(scoped.length > 0, 'no package-scoped task found');
  assert.deepEqual(
    scoped.filter((name) => !workspaces.has(name)),
    [],
  );
});

test('every path-anchored oxlint override names a directory that exists', () => {
  const anchored = readCommentedJson('.oxlintrc.json')
    .overrides.flatMap((override) => override.files)
    .map(staticPrefix)
    .filter((prefix) => prefix.includes('/'));
  assert.ok(anchored.length > 0, 'no path-anchored override found');
  assert.deepEqual(
    anchored.filter((prefix) => !existsSync(new URL(prefix, REPO_ROOT))),
    [],
  );
});

test('every repository-anchored turbo input names a path that exists', () => {
  const anchored = Object.values(readCommentedJson('turbo.json').tasks)
    .flatMap((task) => task.inputs ?? [])
    .map((input) => input.replace(/^!/u, ''))
    .filter((input) => input.startsWith('$TURBO_ROOT$/'))
    .map((input) => staticPrefix(input.slice('$TURBO_ROOT$/'.length)));
  assert.ok(anchored.length > 0, 'no repository-anchored input found');
  assert.deepEqual(
    anchored.filter((prefix) => !existsSync(new URL(prefix, REPO_ROOT))),
    [],
  );
});
