import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { directReads } from './check-reduced-motion.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-reduced-motion.mjs');
const REPO_ROOT = resolve(scriptDir, '..', '..');
const CANONICAL = 'packages/fresco-ui/src/reducedMotion.ts';

const CANONICAL_SOURCE =
  "export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;\n";

/** A throwaway git repository whose index holds `files`. */
function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'reduced-motion-guard-'));
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

test('passes when only the canonical module reads the system', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'packages/thing/src/Thing.tsx':
      "import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';\n",
  });

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Reduced-motion check passed/);
});

test('fails on a matchMedia read outside the canonical module', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'packages/thing/src/scroll.ts':
      'export const smooth = () =>\n' +
      "  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n",
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packages\/thing\/src\/scroll\.ts:2/);
  assert.match(result.stderr, /usePrefersReducedMotion/);
});

test('fails on a CSS media query that ignores the provider, in any area', () => {
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'tooling/theme/motion.css':
      '@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }\n',
    'apps/site/index.html':
      '<style>@media (prefers-reduced-motion: reduce) { #boot { transition: none; } }</style>\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tooling\/theme\/motion\.css:1/);
  assert.match(result.stderr, /apps\/site\/index\.html:1/);
});

test('fails when the matcher no longer recognises the canonical read', () => {
  const cwd = fixture({
    [CANONICAL]: 'export const prefersReducedMotion = () => false;\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /matcher is not reading what it should/);
});

test('accepts a media query that defers to the provider attribute', () => {
  assert.deepEqual(
    directReads(
      ":root[data-reduced-motion='always'] .x { animation: none; }\n" +
        "@media (prefers-reduced-motion: reduce) { :root:not([data-reduced-motion='never']) .x { animation: none; } }\n",
    ),
    [],
  );
});

test('ignores prose in comments, and skips tests and the classic apps', () => {
  assert.deepEqual(
    directReads(
      '/* honours prefers-reduced-motion */\n// prefers-reduced-motion\n<!-- prefers-reduced-motion -->\n',
    ),
    [],
  );

  const read = "matchMedia('(prefers-reduced-motion: reduce)');\n";
  const cwd = fixture({
    [CANONICAL]: CANONICAL_SOURCE,
    'packages/thing/src/__tests__/thing.test.ts': read,
    'packages/thing/src/thing.test.tsx': read,
    'apps/interviewer-classic/src/List.jsx': read,
  });
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('the repository itself passes', () => {
  const result = run(REPO_ROOT);
  assert.equal(result.status, 0, result.stderr);
});
