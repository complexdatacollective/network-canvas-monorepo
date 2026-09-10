import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { hasHydrationFlagShape } from './check-hydration-flag.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-hydration-flag.mjs');
const REPO_ROOT = resolve(scriptDir, '..');
const CANONICAL = 'packages/fresco-ui/src/hooks/useHasHydrated.ts';

const CANONICAL_SOURCE = `
import { useSyncExternalStore } from 'react';
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;
export default function useHasHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
`;

/** A throwaway git repository whose index holds `files`. */
function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'hydration-guard-'));
  execFileSync('git', ['init', '-q'], { cwd });
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, name)), { recursive: true });
    writeFileSync(join(cwd, name), body);
  }
  execFileSync('git', ['add', '-A'], { cwd });
  return cwd;
}

const run = (cwd) =>
  spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });

test('passes when the canonical hook is the only implementation', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'apps/site/components/Thing.tsx':
      "import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';\n" +
      'export const Thing = () => (useHasHydrated() ? <b /> : null);\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Hydration flag check passed/);
});

test('fails on a hand-rolled copy that names its snapshot constants', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'apps/site/components/Copy.tsx':
      "import { useSyncExternalStore } from 'react';\n" +
      'const subscribeToHydration = () => () => undefined;\n' +
      'const getClientHydrationSnapshot = () => true;\n' +
      'const getServerHydrationSnapshot = () => false;\n' +
      'export const useCopy = () => useSyncExternalStore(subscribeToHydration, getClientHydrationSnapshot, getServerHydrationSnapshot);\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/site\/components\/Copy\.tsx/);
  assert.match(result.stderr, /useHasHydrated/);
});

test('fails on a hand-rolled copy written inline', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'packages/thing/src/Inline.tsx':
      "import { useSyncExternalStore } from 'react';\n" +
      'const empty = () => () => {};\n' +
      'export const useInline = () => useSyncExternalStore(empty, () => true, () => false);\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packages\/thing\/src\/Inline\.tsx/);
});

test('fails when the canonical hook stops having the shape, rather than reporting clean', () => {
  // Non-vacuity. A matcher that quietly stopped recognising the shape would
  // otherwise pass a tree full of copies.
  const cwd = fixture({
    [CANONICAL]: 'export default function useHasHydrated() { return true; }\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /matcher is not reading what it should/);
});

test('ignores useSyncExternalStore calls that are not the hydration shape', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'packages/thing/src/RealStore.tsx':
      "import { useSyncExternalStore } from 'react';\n" +
      'export const useRows = (store) => useSyncExternalStore(store.subscribe, store.getRows, store.getServerRows);\n',
    // A store whose client snapshot is constant but whose server snapshot is
    // real work is not this shape either.
    'packages/thing/src/HalfConstant.tsx':
      "import { useSyncExternalStore } from 'react';\n" +
      'const sub = () => () => {};\n' +
      'export const useHalf = (store) => useSyncExternalStore(sub, () => true, store.getServerSnapshot);\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('does not flag a file that only discusses the shape in comments', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'packages/thing/src/Prose.ts':
      '// useSyncExternalStore(subscribe, () => true, () => false) is the shape\n' +
      '/* useSyncExternalStore(s, () => true, () => false) */\n' +
      'export const nothing = 1;\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('the real repository has exactly one implementation', () => {
  const result = run(REPO_ROOT);
  assert.equal(result.status, 0, result.stderr);
});

test('the matcher unit-recognises both spellings and rejects near misses', () => {
  assert.equal(hasHydrationFlagShape(CANONICAL_SOURCE), true);
  assert.equal(
    hasHydrationFlagShape(
      'const s = () => () => {};\nuseSyncExternalStore(s, () => true, () => false);',
    ),
    true,
  );
  // Snapshots the other way round is a different question being asked.
  assert.equal(
    hasHydrationFlagShape(
      'const s = () => () => {};\nuseSyncExternalStore(s, () => false, () => true);',
    ),
    false,
  );
  assert.equal(hasHydrationFlagShape('const x = 1;'), false);
});
