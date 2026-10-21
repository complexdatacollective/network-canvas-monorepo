import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// A workspace's root config files (vite.config.ts and the like) are part of
// its build and, through tsconfig.node.json, of its typecheck program, so a
// shared buildtime module they import must re-hash both tasks when it
// changes. Otherwise a change to that module alone replays a cached green.
test('every buildtime module a root config imports is a build and typecheck input', () => {
  const tasks = readCommentedJson('turbo.json').tasks;
  const missing = [];
  let checked = 0;
  for (const { directory, manifest } of workspaceManifests()) {
    const imported = new Set(
      readdirSync(directory)
        .filter((file) => /\.config\.[cm]?[jt]s$/u.test(file))
        .flatMap((file) => [
          ...readFileSync(join(directory, file), 'utf8').matchAll(
            /['"](?:\.\.\/)+scripts\/buildtime\/([\w.-]+)['"]/gu,
          ),
        ])
        .map((match) => `$TURBO_ROOT$/scripts/buildtime/${match[1]}`),
    );
    for (const taskName of ['build', 'typecheck']) {
      const inputs = tasks[`${manifest.name}#${taskName}`]?.inputs;
      if (!inputs) continue;
      for (const input of imported) {
        checked += 1;
        if (!inputs.includes(input)) {
          missing.push(`${manifest.name}#${taskName}: ${input}`);
        }
      }
    }
  }
  assert.ok(checked > 0, 'no root config imports a buildtime module');
  assert.deepEqual(missing, []);
});
