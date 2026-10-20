import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

// Sketch's tests read some fixtures from other workspace packages straight off
// disk (the world-countries drift guard compares Sketch's copy against the
// canonical GeoJSON in @codaco/protocols). Sketch does not depend on those
// packages, so turbo only re-runs `@codaco/sketch#test` for a change to such a
// file — locally and under CI's `--affected` selection — when the task names it
// in its inputs. This guard keeps every such out-of-package read declared.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKETCH_ROOT = join(REPO_ROOT, 'apps/sketch');

const testFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : testFiles(path);
    }
    return /\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });

// `new URL('<relative path>', import.meta.url)` literals, resolved against the
// test file, that land outside apps/sketch.
const outOfPackageReads = () =>
  testFiles(join(SKETCH_ROOT, 'src')).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [
      ...source.matchAll(
        /new URL\(\s*['"`](\.{1,2}\/[^'"`]+)['"`]\s*,\s*import\.meta\.url/gu,
      ),
    ]
      .map(([, specifier]) => resolve(join(file, '..'), specifier))
      .filter((path) => relative(SKETCH_ROOT, path).startsWith('..'))
      .map((path) => relative(REPO_ROOT, path));
  });

const isCovered = (repoPath, inputs) =>
  inputs.some((input) => {
    if (!input.startsWith('$TURBO_ROOT$/')) return false;
    const declared = input.slice('$TURBO_ROOT$/'.length);
    if (declared === repoPath) return true;
    return (
      declared.endsWith('/**') && repoPath.startsWith(declared.slice(0, -2))
    );
  });

test('every file Sketch tests read from another package is a turbo test input', () => {
  const reads = outOfPackageReads();
  assert.ok(
    reads.includes(
      'packages/protocols/templates/transnational-networks/assets/world-countries.geojson',
    ),
    'expected the world-countries drift guard to read the canonical GeoJSON',
  );
  // turbo.json carries whole-line `//` comments, which JSON.parse rejects.
  const { inputs } = JSON.parse(
    readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//u.test(line))
      .join('\n'),
  ).tasks['@codaco/sketch#test'];
  assert.deepEqual(
    reads.filter((path) => !isCovered(path, inputs)),
    [],
  );
});
