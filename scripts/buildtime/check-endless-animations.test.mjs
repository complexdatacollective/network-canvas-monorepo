import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { endlessLoops } from './check-endless-animations.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-endless-animations.mjs');
const REPO_ROOT = resolve(scriptDir, '..', '..');

const GATED =
  "import { usePageActive } from '@codaco/fresco-ui/pageActivity';\n";

const FRAME_LOOP =
  'const tick = () => {\n' +
  '  move();\n' +
  '  frame = requestAnimationFrame(tick);\n' +
  '};\n';
const MOTION_REPEAT = 'const t = { duration: 2, repeat: Infinity };\n';

// The files the guard expects to find each kind of loop in, gated as they are.
const KNOWN = {
  'packages/art/src/BackgroundLights/BackgroundLights.tsx': GATED + FRAME_LOOP,
  'packages/fresco-ui/src/NodeDropAnimation.tsx': GATED + MOTION_REPEAT,
};

/** A throwaway git repository whose index holds `files`. */
function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'endless-animations-guard-'));
  execFileSync('git', ['init', '-q'], { cwd });
  for (const [name, body] of Object.entries({ ...KNOWN, ...files })) {
    mkdirSync(dirname(join(cwd, name)), { recursive: true });
    writeFileSync(join(cwd, name), body);
  }
  execFileSync('git', ['add', '-A'], { cwd });
  return cwd;
}

const run = (cwd) =>
  spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });

test('passes when every endless loop consults page activity', () => {
  const cwd = fixture({
    'apps/architect/src/Hero.tsx': GATED + FRAME_LOOP,
  });

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Endless-animation check passed/);
});

test('fails on loops that ignore page activity, naming each', () => {
  const cwd = fixture({
    'packages/interview/src/Pulse.tsx': '\n' + MOTION_REPEAT,
    'apps/interviewer/src/Drift.ts': FRAME_LOOP,
    'packages/thing/src/Clock.tsx': 'useAnimationFrame(() => tick());\n',
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /packages\/interview\/src\/Pulse\.tsx:2 \(Motion repeat\)/,
  );
  assert.match(
    result.stderr,
    /apps\/interviewer\/src\/Drift\.ts:3 \(frame loop\)/,
  );
  assert.match(
    result.stderr,
    /packages\/thing\/src\/Clock\.tsx:1 \(Motion useAnimationFrame\)/,
  );
  assert.match(result.stderr, /usePageActive/);
});

test('fails when the matcher no longer finds the known loops', () => {
  const cwd = fixture({
    'packages/art/src/BackgroundLights/BackgroundLights.tsx': GATED,
  });

  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /No frame loop was detected in packages\/art\/src\/BackgroundLights/,
  );
});

test('finds a repeat of Infinity however it is written, gated or not', () => {
  assert.deepEqual(
    endlessLoops(
      'a = { repeat: Number.POSITIVE_INFINITY };\n' +
        'b = { repeat: active ? Infinity : 0 };\n' +
        'c = { repeat: 3 };\n',
    ).map(({ line }) => line),
    [1, 2],
  );
});

test('does not count a frame scheduled by another function, or a one-off', () => {
  assert.deepEqual(
    endlessLoops(
      'const finish = () => done();\n' +
        'requestAnimationFrame(finish);\n' +
        'const later = () => { requestAnimationFrame(finish); };\n' +
        'requestAnimationFrame(() => paint());\n',
    ),
    [],
  );
});

test('finds a self-scheduling function declaration', () => {
  assert.deepEqual(
    endlessLoops(
      'function draw() {\n  paint();\n  requestAnimationFrame(draw);\n}\n',
    ),
    [{ line: 3, kind: 'frame loop' }],
  );
});

test('ignores prose in comments, and skips tests, stories and other apps', () => {
  assert.deepEqual(
    endlessLoops(
      '/* repeat: Infinity */\n// requestAnimationFrame(tick) inside tick\n',
    ),
    [],
  );

  const cwd = fixture({
    'packages/thing/src/__tests__/thing.test.ts': MOTION_REPEAT,
    'packages/thing/src/Thing.stories.tsx': MOTION_REPEAT,
    'apps/networkcanvas.com/components/Hero.tsx': FRAME_LOOP,
  });
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('the repository itself passes', () => {
  const result = run(REPO_ROOT);
  assert.equal(result.status, 0, result.stderr);
});
