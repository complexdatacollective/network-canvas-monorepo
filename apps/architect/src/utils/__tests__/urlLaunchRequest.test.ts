import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureUrlLaunchRequest,
  parseUrlLaunchRequest,
} from '../urlLaunchRequest';

const PROTOCOL_ID = '3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f';
const HANDOFF_KEY = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

const fakeWindow = (href: string) => {
  const url = new URL(href);
  const replaceState = vi.fn();
  return {
    location: {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    } as Location,
    history: { state: { marker: 1 }, replaceState } as unknown as History,
    replaceState,
  };
};

describe('parseUrlLaunchRequest', () => {
  it('reads ?open= with a library row id', () => {
    expect(parseUrlLaunchRequest(`?open=${PROTOCOL_ID}`)).toEqual({
      request: { kind: 'open', protocolId: PROTOCOL_ID },
      search: '',
      present: true,
    });
  });

  it('admits the fixed, token-shaped ids the library also holds', () => {
    expect(parseUrlLaunchRequest('?open=e2e-protocol').request).toEqual({
      kind: 'open',
      protocolId: 'e2e-protocol',
    });
  });

  it('reads ?import= with a UUID hand-off key', () => {
    expect(parseUrlLaunchRequest(`?import=${HANDOFF_KEY}`).request).toEqual({
      kind: 'import',
      handoffKey: HANDOFF_KEY,
    });
  });

  it.each([
    ['an empty id', '?open='],
    ['a path', '?open=..%2Fprotocol'],
    ['markup', '?open=%3Cscript%3E'],
    ['an over-long id', `?open=${'a'.repeat(129)}`],
    ['a non-UUID hand-off key', '?import=e2e-protocol'],
    ['a repeated parameter', `?open=${PROTOCOL_ID}&open=${PROTOCOL_ID}`],
    ['both parameters', `?open=${PROTOCOL_ID}&import=${HANDOFF_KEY}`],
  ])('ignores %s, but still strips it', (_label, search) => {
    const parsed = parseUrlLaunchRequest(search);
    expect(parsed.request).toBeNull();
    expect(parsed.present).toBe(true);
    expect(parsed.search).toBe('');
  });

  it('keeps every other parameter', () => {
    expect(
      parseUrlLaunchRequest(`?lang=fr&open=${PROTOCOL_ID}&x=1`).search,
    ).toBe('?lang=fr&x=1');
  });

  it('reports nothing present when neither parameter is there', () => {
    expect(parseUrlLaunchRequest('?lang=fr')).toEqual({
      request: null,
      search: '?lang=fr',
      present: false,
    });
  });
});

describe('captureUrlLaunchRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strips the parameters with replaceState, keeping path, hash and state', () => {
    const target = fakeWindow(
      `https://architect.test/v8/?open=${PROTOCOL_ID}&lang=fr#top`,
    );

    expect(captureUrlLaunchRequest(target)).toEqual({
      kind: 'open',
      protocolId: PROTOCOL_ID,
    });
    expect(target.replaceState).toHaveBeenCalledWith(
      { marker: 1 },
      '',
      '/v8/?lang=fr#top',
    );
  });

  it('strips a malformed request too, and returns nothing', () => {
    const target = fakeWindow('https://architect.test/v8/?import=nope');

    expect(captureUrlLaunchRequest(target)).toBeNull();
    expect(target.replaceState).toHaveBeenCalledWith({ marker: 1 }, '', '/v8/');
  });

  it('leaves a URL without either parameter untouched', () => {
    const target = fakeWindow('https://architect.test/v8/protocol?lang=fr');

    expect(captureUrlLaunchRequest(target)).toBeNull();
    expect(target.replaceState).not.toHaveBeenCalled();
  });
});

describe('the request captured at load', () => {
  // Architect 8 served inside Architect 9, the only build handed requests.
  beforeEach(() => {
    vi.stubEnv('BASE_URL', '/v8/');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is handed to the consumer of its kind once, and the URL is clean before analytics', async () => {
    window.history.replaceState(null, '', `/?import=${HANDOFF_KEY}`);
    vi.resetModules();

    const mod = await import('../urlLaunchRequest');

    expect(window.location.search).toBe('');
    expect(mod.takeUrlOpenRequest()).toBeNull();
    expect(mod.takeUrlImportRequest()).toBe(HANDOFF_KEY);
    expect(mod.takeUrlImportRequest()).toBeNull();
  });

  it('hands ?open= to the open consumer only', async () => {
    window.history.replaceState(null, '', `/?open=${PROTOCOL_ID}`);
    vi.resetModules();

    const mod = await import('../urlLaunchRequest');

    expect(mod.takeUrlImportRequest()).toBeNull();
    expect(mod.takeUrlOpenRequest()).toBe(PROTOCOL_ID);
    expect(mod.takeUrlOpenRequest()).toBeNull();
  });

  it('is never taken by standalone Architect 8, which leaves the URL alone', async () => {
    vi.stubEnv('BASE_URL', '/');
    window.history.replaceState(null, '', `/?open=${PROTOCOL_ID}`);
    vi.resetModules();

    const mod = await import('../urlLaunchRequest');

    expect(window.location.search).toBe(`?open=${PROTOCOL_ID}`);
    expect(mod.takeUrlOpenRequest()).toBeNull();
    expect(mod.takeUrlImportRequest()).toBeNull();
  });
});

describe('main.tsx', () => {
  // ES modules evaluate in import order, and ./analytics records the first
  // page view as it is evaluated. An import sorter that moved this capture
  // below it would send protocol ids and hand-off keys to analytics.
  it('evaluates the capture before analytics', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../main.tsx'),
      'utf8',
    );
    const capture = source.indexOf("import './utils/urlLaunchRequest';");
    const analytics = source.indexOf("import './analytics';");

    expect(capture).toBeGreaterThan(-1);
    expect(analytics).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(analytics);
    const earlierImports = source
      .slice(0, capture)
      .split('\n')
      .filter((line) => line.startsWith('import'));
    expect(earlierImports.join('\n')).not.toMatch(/analytics|reportError/);
  });
});
