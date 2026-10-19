import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureUrlLaunchRequest,
  parseUrlLaunchRequest,
} from '../urlLaunchRequest';

const HASH = 'q2Vb3n0p9X_cE-1lK4mZ8sT6yU7wA5dF0gH2jR3tY9o';
const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e';

const at = (path: string) => {
  const url = new URL(path, 'https://interviewer.example');
  const replaceState = vi.fn();
  return {
    target: {
      location: { pathname: url.pathname, search: url.search, hash: url.hash },
      history: { state: { from: 'test' }, replaceState },
    } as unknown as Pick<Window, 'location' | 'history'>,
    replaceState,
  };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

describe('parseUrlLaunchRequest', () => {
  it('reads a start request for a protocol hash', () => {
    expect(parseUrlLaunchRequest(`?start=${HASH}`)).toEqual({
      request: { kind: 'start', protocolHash: HASH },
      search: '',
      present: true,
    });
  });

  it('reads an import request for a hand-off key', () => {
    expect(parseUrlLaunchRequest(`?import=${KEY}`).request).toEqual({
      kind: 'import',
      handoffKey: KEY,
    });
  });

  it('keeps other parameters when it removes its own', () => {
    expect(parseUrlLaunchRequest(`?a=1&start=${HASH}&b=2`).search).toBe(
      '?a=1&b=2',
    );
    expect(parseUrlLaunchRequest('?a=1').present).toBe(false);
  });

  it.each([
    ['an empty hash', '?start='],
    ['a hash carrying a path', '?start=..%2Fdata'],
    ['a hash carrying markup', '?start=%3Cscript%3E'],
    ['an overlong hash', `?start=${'a'.repeat(129)}`],
    ['a key that is not a UUID', '?import=not-a-key'],
    ['a repeated parameter', `?start=${HASH}&start=${HASH}`],
    ['both parameters at once', `?start=${HASH}&import=${KEY}`],
  ])('ignores %s, and still removes it', (_, search) => {
    const parsed = parseUrlLaunchRequest(search);

    expect(parsed.request).toBeNull();
    expect(parsed.present).toBe(true);
    expect(parsed.search).toBe('');
  });
});

describe('captureUrlLaunchRequest', () => {
  it('strips the request from the address bar, keeping the path, the rest of the query and the hash', () => {
    const { target, replaceState } = at(`/v8/?start=${HASH}&lang=es#top`);

    expect(captureUrlLaunchRequest(target)).toEqual({
      kind: 'start',
      protocolHash: HASH,
    });
    expect(replaceState).toHaveBeenCalledWith(
      { from: 'test' },
      '',
      '/v8/?lang=es#top',
    );
  });

  it('strips a malformed request too', () => {
    const { target, replaceState } = at('/?import=nope');

    expect(captureUrlLaunchRequest(target)).toBeNull();
    expect(replaceState).toHaveBeenCalledWith({ from: 'test' }, '', '/');
  });

  it('leaves a URL without a request alone', () => {
    const { target, replaceState } = at('/data?x=1');

    expect(captureUrlLaunchRequest(target)).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('honours the request when the history write is refused', () => {
    const { target, replaceState } = at(`/?start=${HASH}`);
    replaceState.mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(captureUrlLaunchRequest(target)?.kind).toBe('start');
  });
});

describe('the request this page was opened with', () => {
  const loadAt = async (path: string) => {
    window.history.replaceState(null, '', path);
    vi.resetModules();
    return import('../urlLaunchRequest');
  };

  it('is taken from the URL as the module loads, and handed over once', async () => {
    const mod = await loadAt(`/?start=${HASH}`);

    expect(window.location.search).toBe('');
    expect(mod.getOpeningStartRequest()).toBe(HASH);
    expect(mod.takeUrlImportRequest()).toBeNull();
    expect(mod.peekUrlStartRequest()).toBe(HASH);
    expect(mod.takeUrlStartRequest()).toBe(HASH);
    expect(mod.takeUrlStartRequest()).toBeNull();
    expect(mod.peekUrlStartRequest()).toBeNull();
    // How the page was opened outlives the request itself.
    expect(mod.getOpeningStartRequest()).toBe(HASH);
  });

  it('hands an import key over once', async () => {
    const mod = await loadAt(`/?import=${KEY}`);

    expect(window.location.search).toBe('');
    expect(mod.getOpeningStartRequest()).toBeNull();
    expect(mod.takeUrlStartRequest()).toBeNull();
    expect(mod.takeUrlImportRequest()).toBe(KEY);
    expect(mod.takeUrlImportRequest()).toBeNull();
  });

  it('is nothing for a page opened without one', async () => {
    const mod = await loadAt('/data');

    expect(mod.getOpeningStartRequest()).toBeNull();
    expect(mod.takeUrlStartRequest()).toBeNull();
    expect(mod.takeUrlImportRequest()).toBeNull();
  });
});
