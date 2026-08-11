import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSpecifiers,
  shouldCheckSpecifier,
  stripCommentLines,
} from './verify-packaged-app-sweep.cjs';

test('extractSpecifiers finds require and import forms', () => {
  const source = `
    const a = require('archiver');
    const b = require("lodash/defaults");
    import fs from 'fs-extra';
    import { x } from './relative';
    export { y } from '../parent';
    const lazy = await import('decompress');
    import 'side-effect';
  `;
  assert.deepEqual(
    [...extractSpecifiers(source)].toSorted((a, b) => a.localeCompare(b)),
    [
      '../parent',
      './relative',
      'archiver',
      'decompress',
      'fs-extra',
      'lodash/defaults',
      'side-effect',
    ],
  );
});

test('extractSpecifiers ignores computed and member-expression requires', () => {
  const source = `
    const dynamic = require(someVariable);
    const templated = require(\`./locales/\${lang}\`);
    foo.require('not-a-require');
  `;
  assert.deepEqual([...extractSpecifiers(source)], []);
});

test('extractSpecifiers ignores commented and type-only requires', () => {
  const source = `
    // const doc = require('commented-out');
    /**
     * @example require('jsdoc-example')
     */
    /** @type {import('./types').Cache} */
    var cache = /** @type {import('./types').Getter} */ (getter);
    const real = require('real-module');
  `;
  assert.deepEqual([...extractSpecifiers(source)], ['real-module']);
});

test('stripCommentLines keeps executable code on comment-bearing lines', () => {
  const stripped = stripCommentLines(
    `const kept = require('kept'); /* inline */ const also = 1;`,
  );
  assert.match(stripped, /require\('kept'\)/);
  assert.match(stripped, /const also = 1;/);
});

test('shouldCheckSpecifier skips builtins, electron, and allowed missing', () => {
  assert.equal(shouldCheckSpecifier('fs'), false);
  assert.equal(shouldCheckSpecifier('node:path'), false);
  assert.equal(shouldCheckSpecifier('fs/promises'), false);
  assert.equal(shouldCheckSpecifier('electron'), false);
  assert.equal(shouldCheckSpecifier('electron/main'), false);
  assert.equal(shouldCheckSpecifier('electron-devtools-installer'), false);
  assert.equal(shouldCheckSpecifier('data:text/javascript,'), false);
});

test('shouldCheckSpecifier checks real packages and relative paths', () => {
  assert.equal(shouldCheckSpecifier('archiver'), true);
  assert.equal(shouldCheckSpecifier('lodash/defaults'), true);
  assert.equal(shouldCheckSpecifier('readable-stream/passthrough'), true);
  assert.equal(shouldCheckSpecifier('./relative'), true);
  // electron-log is a real runtime dependency, not the electron runtime.
  assert.equal(shouldCheckSpecifier('electron-log'), true);
});
