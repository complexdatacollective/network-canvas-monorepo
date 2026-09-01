import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertPwaCacheHeaders } from './assert-pwa-cache-headers.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const sourceHeaders = (app) =>
  readFileSync(path.join(repositoryRoot, 'apps', app, 'public', '_headers'), {
    encoding: 'utf8',
  });

describe('PWA cache headers', () => {
  it('protects every stable Architect entry point and keeps hashed assets immutable', () => {
    assert.doesNotThrow(() =>
      assertPwaCacheHeaders({
        additionalStablePaths: [
          '/preview/',
          '/preview/index.html',
          '/architect-icon.png',
        ],
        text: sourceHeaders('architect'),
      }),
    );
  });

  it('protects every stable Interviewer entry point and keeps hashed assets immutable', () => {
    assert.doesNotThrow(() =>
      assertPwaCacheHeaders({
        additionalStablePaths: ['/interviewer-icon.png'],
        text: sourceHeaders('interviewer'),
      }),
    );
  });

  it('rejects a cacheable stable entry point', () => {
    const broken = sourceHeaders('interviewer').replace(
      'Cache-Control: no-store, no-cache, max-age=0, must-revalidate',
      'Cache-Control: public, max-age=86400, must-revalidate',
    );

    assert.throws(
      () =>
        assertPwaCacheHeaders({
          additionalStablePaths: ['/interviewer-icon.png'],
          text: broken,
        }),
      /invalid Cache-Control for \/.*max-age=86400/,
    );
  });

  it('rejects missing no-store coverage for rewritten SPA deep links', () => {
    const broken = sourceHeaders('interviewer').replace(
      '/*\n  Cache-Control: no-store, no-cache, max-age=0, must-revalidate\n',
      '',
    );

    assert.throws(
      () =>
        assertPwaCacheHeaders({
          additionalStablePaths: ['/interviewer-icon.png'],
          text: broken,
        }),
      /missing Cache-Control for \/\*/,
    );
  });

  it('rejects cacheable rewritten SPA deep links', () => {
    const broken = sourceHeaders('interviewer').replace(
      '/*\n  Cache-Control: no-store, no-cache, max-age=0, must-revalidate',
      '/*\n  Cache-Control: public, max-age=86400, must-revalidate',
    );

    assert.throws(
      () =>
        assertPwaCacheHeaders({
          additionalStablePaths: ['/interviewer-icon.png'],
          text: broken,
        }),
      /invalid Cache-Control for \/\*.*max-age=86400/,
    );
  });
});
