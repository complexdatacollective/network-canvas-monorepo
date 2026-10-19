import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it } from 'vitest';

import { assertPwaCacheHeaders } from './assert-pwa-cache-headers.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const sourceHeaders = (app) =>
  readFileSync(path.join(repositoryRoot, 'apps', app, 'public', '_headers'), {
    encoding: 'utf8',
  });

// Architect serves Architect 8 at /v8/ from the same deploy, so its contract
// covers that app's entry points and hashed assets too (the same lists as
// apps/architect/scripts/assert-pwa-build.mjs).
const architectContract = {
  additionalStablePaths: [
    '/preview/',
    '/preview/index.html',
    '/architect-icon.png',
    '/v8/',
    '/v8/index.html',
    '/v8/sw.js',
    '/v8/manifest.webmanifest',
    '/v8/preview/',
    '/v8/preview/index.html',
  ],
  additionalImmutablePaths: ['/v8/assets/*'],
};

describe('PWA cache headers', () => {
  it('protects every stable Architect entry point and keeps hashed assets immutable', () => {
    assert.doesNotThrow(() =>
      assertPwaCacheHeaders({
        ...architectContract,
        text: sourceHeaders('architect'),
      }),
    );
  });

  it('rejects an Architect deploy whose nested Architect 8 assets are not immutable', () => {
    const broken = sourceHeaders('architect').replace(
      '/v8/assets/*\n  Cache-Control: public, max-age=31536000, immutable',
      '/v8/assets/*\n  Cache-Control: no-store, no-cache, max-age=0, must-revalidate',
    );
    assert.notEqual(broken, sourceHeaders('architect'));

    assert.throws(
      () => assertPwaCacheHeaders({ ...architectContract, text: broken }),
      /invalid Cache-Control for \/v8\/assets\/\*/,
    );
  });

  it('rejects an Architect deploy that leaves the nested Architect 8 worker cacheable', () => {
    const broken = sourceHeaders('architect').replace(
      '/v8/sw.js\n  Cache-Control: no-store, no-cache, max-age=0, must-revalidate\n',
      '',
    );
    assert.notEqual(broken, sourceHeaders('architect'));

    assert.throws(
      () => assertPwaCacheHeaders({ ...architectContract, text: broken }),
      /missing Cache-Control for \/v8\/sw\.js/,
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
