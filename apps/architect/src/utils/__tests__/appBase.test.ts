import { describe, expect, it } from 'vitest';

import { createAppBase } from '../appBase';

describe('createAppBase', () => {
  it('is the identity at the root, matching wouter with no base', () => {
    const root = createAppBase('/');

    expect(root.routerBase).toBe('');
    expect(root.isSubpath).toBe(false);
    for (const path of ['/', '/protocol', '/protocol/stage/1?x=1#y']) {
      expect(root.toBrowserPath(path)).toBe(path);
      expect(root.toAppPath(path)).toBe(path);
    }
  });

  it('prefixes app paths with a sub-path base for the browser', () => {
    const v8 = createAppBase('/v8/');

    expect(v8.routerBase).toBe('/v8');
    expect(v8.isSubpath).toBe(true);
    expect(v8.toBrowserPath('/')).toBe('/v8/');
    expect(v8.toBrowserPath('/protocol')).toBe('/v8/protocol');
  });

  it('strips the base from browser paths, query and hash included', () => {
    const v8 = createAppBase('/v8/');

    expect(v8.toAppPath('/v8/protocol/stage/1')).toBe('/protocol/stage/1');
    expect(v8.toAppPath('/v8/')).toBe('/');
    expect(v8.toAppPath('/v8')).toBe('/');
    expect(v8.toAppPath('/v8?open=1')).toBe('/?open=1');
    expect(v8.toAppPath('/v8#top')).toBe('/#top');
  });

  it('passes app paths, and paths that only share a prefix, through unchanged', () => {
    const v8 = createAppBase('/v8/');

    expect(v8.toAppPath('/protocol')).toBe('/protocol');
    expect(v8.toAppPath('/v80/protocol')).toBe('/v80/protocol');
  });

  it('round-trips every app path', () => {
    const v8 = createAppBase('/v8/');

    for (const path of ['/', '/protocol', '/protocol/stage/new?type=x']) {
      expect(v8.toAppPath(v8.toBrowserPath(path))).toBe(path);
    }
  });
});
