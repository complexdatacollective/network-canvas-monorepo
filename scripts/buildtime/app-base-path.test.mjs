import { describe, expect, it } from 'vitest';

import {
  appCachePrefix,
  rebaseSwMatcher,
  resolveAppBasePath,
} from './app-base-path.mjs';

const at = (path) => ({
  request: { mode: 'navigate' },
  sameOrigin: true,
  url: new URL(path, 'https://app.example'),
});

const interviewMatcher = ({ request, sameOrigin, url }) =>
  sameOrigin &&
  request.mode === 'navigate' &&
  url.pathname.startsWith('/interview/');

const iconMatcher = ({ url }) =>
  /\.(?:png|webp)$/i.test(url.pathname) &&
  !['/pwa-64x64.png', '/interviewer-icon.png'].includes(url.pathname);

const assetMatcher = ({ url }) =>
  url.href.startsWith('//cdn') || url.pathname.startsWith('/assets/');

describe('resolveAppBasePath', () => {
  const VARIABLE = 'INTERVIEWER_BASE_PATH';

  it('treats an unset, empty or root value as the root build', () => {
    expect(resolveAppBasePath({}, VARIABLE)).toBe('/');
    expect(resolveAppBasePath({ [VARIABLE]: '' }, VARIABLE)).toBe('/');
    expect(resolveAppBasePath({ [VARIABLE]: ' / ' }, VARIABLE)).toBe('/');
  });

  it('reads only the variable it is given', () => {
    expect(resolveAppBasePath({ ARCHITECT_BASE_PATH: '/v8/' }, VARIABLE)).toBe(
      '/',
    );
    expect(
      resolveAppBasePath(
        { ARCHITECT_BASE_PATH: '/v8/' },
        'ARCHITECT_BASE_PATH',
      ),
    ).toBe('/v8/');
  });

  it('normalises a sub-path to leading and trailing slashes', () => {
    expect(resolveAppBasePath({ [VARIABLE]: '/v8/' }, VARIABLE)).toBe('/v8/');
    expect(resolveAppBasePath({ [VARIABLE]: 'v8' }, VARIABLE)).toBe('/v8/');
    expect(resolveAppBasePath({ [VARIABLE]: '/a/b' }, VARIABLE)).toBe('/a/b/');
  });

  it('refuses a value that would not be safe inside worker source, naming the variable', () => {
    for (const value of ['/V8/', '/v8 /', '/v"8/', '/v8/../', '/v8//x/']) {
      expect(() => resolveAppBasePath({ [VARIABLE]: value }, VARIABLE)).toThrow(
        /INTERVIEWER_BASE_PATH/,
      );
    }
  });
});

describe('appCachePrefix', () => {
  it('keeps the root prefix existing caches already carry', () => {
    expect(appCachePrefix('interviewer', '/')).toBe('interviewer-');
    expect(appCachePrefix('architect', '/')).toBe('architect-');
  });

  it('gives a sub-path build its own prefix', () => {
    expect(appCachePrefix('interviewer', '/v8/')).toBe('interviewer-v8-');
    expect(appCachePrefix('interviewer', '/a/b/')).toBe('interviewer-a-b-');
  });
});

describe('rebaseSwMatcher', () => {
  it('returns the root matcher itself, so the root worker source is unchanged', () => {
    expect(rebaseSwMatcher(interviewMatcher, '/')).toBe(interviewMatcher);
  });

  it('rebases quoted root-absolute literals, in source and in behaviour', () => {
    const rebased = rebaseSwMatcher(interviewMatcher, '/v8/');

    expect(rebased.toString()).toContain("'/v8/interview/'");
    expect(rebased.toString()).not.toContain("'/interview/'");
    expect(rebased(at('/v8/interview/abc'))).toBe(true);
    expect(rebased(at('/interview/abc'))).toBe(false);
  });

  it('rebases every literal in a list and leaves regular expressions alone', () => {
    const rebased = rebaseSwMatcher(iconMatcher, '/v8/');

    expect(rebased(at('/v8/pwa-64x64.png'))).toBe(false);
    expect(rebased(at('/v8/interviewer-icon.png'))).toBe(false);
    expect(rebased(at('/v8/assets/photo.png'))).toBe(true);
    expect(rebased(at('/v8/assets/photo.svg'))).toBe(false);
  });

  it('leaves protocol-relative strings untouched', () => {
    const source = rebaseSwMatcher(assetMatcher, '/v8/').toString();
    expect(source).toMatch(/["']\/\/cdn["']/);
    expect(source).toMatch(/["']\/v8\/assets\/["']/);
  });
});
