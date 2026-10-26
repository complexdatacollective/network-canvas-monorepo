import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

// An app's node tsconfig compiles its Vite config together with everything
// that config imports, so a shared module the config reaches outside the app
// directory is typechecked only by that app's typecheck task. Turbo hashes a
// task's inputs, not its import graph: a shared module missing from the
// inputs lets a change confined to it replay a cached green typecheck, and a
// type error in it lands unseen. Workspace package sources are left out: the
// `^topo` edge re-hashes a consumer whenever a dependency's files change.

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const readCommentedJson = (file) =>
  JSON.parse(
    readFileSync(path.join(repoRoot, file), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n'),
  );

const SOURCE_EXTENSIONS = ['', '.ts', '.mts', '.mjs', '.js'];

const resolveRelative = (fromFile, specifier) => {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && /\.[cm]?[jt]s$/.test(candidate))
      return candidate;
  }
  return null;
};

// Every source file a Vite config reaches through relative imports, the
// config included.
const relativeImportGraph = (entry) => {
  const seen = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(
      /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g,
    )) {
      const resolved = resolveRelative(file, match[1]);
      if (resolved) pending.push(resolved);
    }
  }
  return seen;
};

// The subset of turbo's glob syntax the typecheck inputs use: exact paths and
// a trailing `/**`.
const covers = (input, repoPath) => {
  if (!input.startsWith('$TURBO_ROOT$/')) return false;
  const pattern = input.slice('$TURBO_ROOT$/'.length);
  if (pattern.endsWith('/**'))
    return repoPath.startsWith(pattern.slice(0, -'**'.length));
  return pattern === repoPath;
};

const viteConfigs = (appDir) =>
  readdirSync(path.join(repoRoot, appDir))
    .filter((name) => /^vite(?:\.[a-z]+)?\.config\.ts$/.test(name))
    .map((name) => path.join(repoRoot, appDir, name));

test('every shared module a Vite config imports is an input of its typecheck', () => {
  const tasks = readCommentedJson('turbo.json').tasks;
  const checked = [];
  for (const appDir of [
    'apps/architect',
    'apps/interviewer',
    'apps/studio/web',
  ]) {
    const { name } = JSON.parse(
      readFileSync(path.join(repoRoot, appDir, 'package.json'), 'utf8'),
    );
    const task = tasks[`${name}#typecheck`];
    assert.ok(task, `${name}#typecheck is not configured in turbo.json`);
    const appRoot = `${path.join(repoRoot, appDir)}${path.sep}`;
    const outside = viteConfigs(appDir)
      .flatMap((config) => [...relativeImportGraph(config)])
      .filter((file) => !file.startsWith(appRoot))
      .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
      .filter((repoPath) => !repoPath.startsWith('packages/'));
    checked.push(...outside);
    assert.deepEqual(
      [...new Set(outside)].filter(
        (repoPath) =>
          !(task.inputs ?? []).some((input) => covers(input, repoPath)),
      ),
      [],
      `${name}#typecheck must list these shared modules its Vite config imports`,
    );
  }
  assert.ok(
    checked.includes('scripts/buildtime/legacy-app.ts'),
    'the import walk no longer reaches the shared legacy-app module',
  );
});
