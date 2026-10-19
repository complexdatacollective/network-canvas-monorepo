import { describe, expect, it } from 'vitest';

// Architect's use of the shared helper: its own variable, cache prefix and
// worker matchers. The helper's general rules are covered beside it in
// scripts/buildtime/app-base-path.test.mjs.
import {
  appCachePrefix,
  rebaseSwMatcher,
  resolveAppBasePath,
} from '../../../../scripts/buildtime/app-base-path.mjs';

type MatchContext = { sameOrigin: boolean; url: URL };

const at = (path: string): MatchContext => ({
  sameOrigin: true,
  url: new URL(path, 'https://architect.example'),
});

const resolveArchitectBasePath = (env: Record<string, string | undefined>) =>
  resolveAppBasePath(env, 'ARCHITECT_BASE_PATH');

describe('resolveAppBasePath for ARCHITECT_BASE_PATH', () => {
  it('treats an unset, empty or root value as the root build', () => {
    expect(resolveArchitectBasePath({})).toBe('/');
    expect(resolveArchitectBasePath({ ARCHITECT_BASE_PATH: '' })).toBe('/');
    expect(resolveArchitectBasePath({ ARCHITECT_BASE_PATH: ' / ' })).toBe('/');
  });

  it('normalises a sub-path to leading and trailing slashes', () => {
    expect(resolveArchitectBasePath({ ARCHITECT_BASE_PATH: '/v8/' })).toBe(
      '/v8/',
    );
    expect(resolveArchitectBasePath({ ARCHITECT_BASE_PATH: 'v8' })).toBe(
      '/v8/',
    );
    expect(resolveArchitectBasePath({ ARCHITECT_BASE_PATH: '/a/b' })).toBe(
      '/a/b/',
    );
  });

  it('refuses a value that would not be safe inside worker source', () => {
    for (const value of ['/V8/', '/v8 /', '/v"8/', '/v8/../', '/v8//x/']) {
      expect(() =>
        resolveArchitectBasePath({ ARCHITECT_BASE_PATH: value }),
      ).toThrow(/ARCHITECT_BASE_PATH/);
    }
  });
});

describe('appCachePrefix for Architect', () => {
  it('keeps the root prefix existing caches already carry', () => {
    expect(appCachePrefix('architect', '/')).toBe('architect-');
  });

  it('gives a sub-path build its own prefix', () => {
    expect(appCachePrefix('architect', '/v8/')).toBe('architect-v8-');
    expect(appCachePrefix('architect', '/a/b/')).toBe('architect-a-b-');
  });
});

describe('rebaseSwMatcher', () => {
  const previewMatcher = ({ sameOrigin, url }: MatchContext) =>
    sameOrigin && url.pathname.startsWith('/preview/');

  it('returns the root matcher itself, so the root worker source is unchanged', () => {
    expect(rebaseSwMatcher(previewMatcher, '/')).toBe(previewMatcher);
  });

  it('rebases quoted root-absolute literals, in source and in behaviour', () => {
    const rebased = rebaseSwMatcher(previewMatcher, '/v8/');

    expect(rebased.toString()).toContain('"/v8/preview/"');
    expect(rebased.toString()).not.toContain('"/preview/"');
    expect(rebased(at('/v8/preview/'))).toBe(true);
    expect(rebased(at('/preview/'))).toBe(false);
  });

  it('rebases every literal in a list and leaves regular expressions alone', () => {
    const iconMatcher = ({ url }: MatchContext) =>
      /\.(?:png|webp)$/i.test(url.pathname) &&
      !['/pwa-64x64.png', '/architect-icon.png'].includes(url.pathname);
    const rebased = rebaseSwMatcher(iconMatcher, '/v8/');

    expect(rebased(at('/v8/pwa-64x64.png'))).toBe(false);
    expect(rebased(at('/v8/architect-icon.png'))).toBe(false);
    expect(rebased(at('/v8/assets/photo.png'))).toBe(true);
    expect(rebased(at('/v8/assets/photo.svg'))).toBe(false);
  });

  it('leaves protocol-relative strings untouched', () => {
    const matcher = ({ url }: MatchContext) =>
      url.href.startsWith('//cdn') || url.pathname.startsWith('/assets/');

    const source = rebaseSwMatcher(matcher, '/v8/').toString();
    expect(source).toMatch(/["']\/\/cdn["']/);
    expect(source).toMatch(/["']\/v8\/assets\/["']/);
  });
});
