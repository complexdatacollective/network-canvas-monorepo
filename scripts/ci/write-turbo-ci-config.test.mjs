import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
  withPinnedConcurrency,
  writeTurboCiConfig,
} from './write-turbo-ci-config.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(scriptDir, '..', '..');
const TURBO_JSON = join(REPO_ROOT, 'turbo.json');

test('the real turbo.json yields a config that pins concurrency to 1', () => {
  const source = readFileSync(TURBO_JSON, 'utf8');
  const generated = withPinnedConcurrency(source);

  assert.match(generated, /^\{\n {2}"concurrency": "1",\n/);
});

test('everything after the inserted key is byte-for-byte the source', () => {
  // The guarantee that lets the generated file carry turbo.json's few hundred
  // lines of task-graph comments: nothing is reserialised, so nothing is lost.
  const source = readFileSync(TURBO_JSON, 'utf8');
  const generated = withPinnedConcurrency(source);
  const inserted = '  "concurrency": "1",\n';

  assert.equal(generated.replace(inserted, ''), source);
});

test('the generated config is still parseable once comments are stripped', () => {
  // turbo.json is JSONC, so this is a sanity check on the insertion point
  // rather than a full parse of the committed file.
  const generated = withPinnedConcurrency('{\n  "ui": "tui"\n}\n');

  assert.deepEqual(JSON.parse(generated), { concurrency: '1', ui: 'tui' });
});

test('a turbo.json that already sets concurrency is refused', () => {
  // Two sources for one key drift. If someone pins it in turbo.json, the
  // generator must stop rather than silently emit a duplicate.
  assert.throws(
    () => withPinnedConcurrency('{\n  "concurrency": "4",\n  "ui": "tui"\n}\n'),
    /already sets `concurrency`/,
  );
  assert.throws(
    () =>
      withPinnedConcurrency(
        '{\n  // a comment first\n  "concurrency": "4"\n}\n',
      ),
    /already sets `concurrency`/,
  );
});

test('a turbo.json whose brace is not alone on line one is refused', () => {
  // Rather than reformat someone else's file to make room for the key.
  assert.throws(
    () => withPinnedConcurrency('{ "ui": "tui" }\n'),
    /cannot be inserted without reformatting/,
  );
});

test('a per-task `concurrency` string does not trip the top-level guard', () => {
  const source =
    '{\n  "tasks": {\n    "build": { "concurrency": "2" }\n  }\n}\n';

  assert.match(withPinnedConcurrency(source), /^\{\n {2}"concurrency": "1",\n/);
});

test('writeTurboCiConfig writes turbo.ci.json beside the source config', () => {
  const root = mkdtempSync(join(tmpdir(), 'turbo-ci-config-'));
  writeFileSync(join(root, 'turbo.json'), '{\n  "ui": "tui"\n}\n');

  const target = writeTurboCiConfig(root);

  assert.equal(target, join(root, 'turbo.ci.json'));
  assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), {
    concurrency: '1',
    ui: 'tui',
  });
});

test('writeTurboCiConfig refuses a source that already pins concurrency', () => {
  const root = mkdtempSync(join(tmpdir(), 'turbo-ci-config-'));
  writeFileSync(join(root, 'turbo.json'), '{\n  "concurrency": "4"\n}\n');

  assert.throws(() => writeTurboCiConfig(root), /already sets `concurrency`/);
  assert.ok(
    !existsSync(join(root, 'turbo.ci.json')),
    'nothing is written when the source is refused',
  );
});
