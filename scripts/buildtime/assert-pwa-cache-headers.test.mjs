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

  describe('nested app bases', () => {
    const architectStablePaths = [
      '/preview/',
      '/preview/index.html',
      '/architect-icon.png',
    ];
    const v8Rules = [
      '/v8/',
      '/v8/sw.js',
      '/v8/index.html',
      '/v8/manifest.webmanifest',
      '/v8/favicon.ico',
      '/v8/apple-touch-icon-180x180.png',
      '/v8/pwa-64x64.png',
      '/v8/pwa-192x192.png',
      '/v8/pwa-512x512.png',
      '/v8/maskable-icon-512x512.png',
      '/v8/preview/',
      '/v8/preview/index.html',
      '/v8/architect-icon.png',
    ]
      .map(
        (rulePath) =>
          `${rulePath}\n  Cache-Control: no-store, no-cache, max-age=0, must-revalidate\n`,
      )
      .join('');
    const v8Immutable =
      '/v8/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n';
    const withV8 = (text) => `${text}\n${v8Rules}${v8Immutable}`;

    it("accepts a root file that carries the nested build's contract", () => {
      assert.doesNotThrow(() =>
        assertPwaCacheHeaders({
          additionalStablePaths: architectStablePaths,
          nestedBases: ['/v8/'],
          text: withV8(sourceHeaders('architect')),
        }),
      );
    });

    it('leaves the contract unchanged when no nested base is named', () => {
      assert.doesNotThrow(() =>
        assertPwaCacheHeaders({
          additionalStablePaths: architectStablePaths,
          nestedBases: [],
          text: sourceHeaders('architect'),
        }),
      );
    });

    it('rejects a missing no-store rule for a rebased stable path', () => {
      assert.throws(
        () =>
          assertPwaCacheHeaders({
            additionalStablePaths: architectStablePaths,
            nestedBases: ['/v8/'],
            text: sourceHeaders('architect'),
          }),
        /missing Cache-Control for \/v8\//,
      );
    });

    it('rejects a nested assets directory that is not immutable', () => {
      assert.throws(
        () =>
          assertPwaCacheHeaders({
            additionalStablePaths: architectStablePaths,
            nestedBases: ['/v8/'],
            text: `${sourceHeaders('architect')}\n${v8Rules}`,
          }),
        /missing Cache-Control for \/v8\/assets\/\*/,
      );
    });

    it('rejects a malformed nested base', () => {
      assert.throws(
        () =>
          assertPwaCacheHeaders({
            additionalStablePaths: architectStablePaths,
            nestedBases: ['/v8'],
            text: withV8(sourceHeaders('architect')),
          }),
        /nested base must look like/,
      );
    });
  });
});
