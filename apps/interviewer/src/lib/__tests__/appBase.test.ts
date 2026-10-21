import { describe, expect, it } from 'vitest';

import { createAppBase } from '../appBase';

describe('createAppBase', () => {
  it('is the identity at the root, matching wouter with no base', () => {
    const root = createAppBase('/');

    expect(root.routerBase).toBe('');
    for (const path of ['/', '/data', '/interview/s1?x=1#y', '/v8/data']) {
      expect(root.toBrowserPath(path)).toBe(path);
      expect(root.toAppPath(path)).toBe(path);
    }
  });

  it('prefixes app paths with a sub-path base for the browser', () => {
    const v8 = createAppBase('/v8/');

    expect(v8.routerBase).toBe('/v8');
    expect(v8.toBrowserPath('/')).toBe('/v8/');
    expect(v8.toBrowserPath('/interview/s1')).toBe('/v8/interview/s1');
  });

  it('strips the base from browser paths, query and hash included', () => {
    const v8 = createAppBase('/v8/');

    expect(v8.toAppPath('/v8/interview/s1')).toBe('/interview/s1');
    expect(v8.toAppPath('/v8/')).toBe('/');
    expect(v8.toAppPath('/v8')).toBe('/');
    expect(v8.toAppPath('/v8?mode=review')).toBe('/?mode=review');
    expect(v8.toAppPath('/v8#top')).toBe('/#top');
  });

  it('passes app paths, and paths that only share a prefix, through unchanged', () => {
    const v8 = createAppBase('/v8/');

    expect(v8.toAppPath('/interview/s1')).toBe('/interview/s1');
    expect(v8.toAppPath('/v80/interview/s1')).toBe('/v80/interview/s1');
  });

  it('round-trips every app path', () => {
    const v8 = createAppBase('/v8/');

    for (const path of ['/', '/data', '/interview/s1?x=1']) {
      expect(v8.toAppPath(v8.toBrowserPath(path))).toBe(path);
    }
  });
});
