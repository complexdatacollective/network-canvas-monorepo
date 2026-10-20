import { afterEach, describe, expect, it, vi } from 'vitest';

// Interviewer 8 framed by Interviewer 9: the handshake that hands the lock's
// key over (see interviewer9Embed.ts). The module reads how the page is framed
// as it loads, so each case loads it fresh, under a frame of its own making.

type Posted = { message: unknown; targetOrigin: string };

const ORIGIN = window.location.origin;

const dataKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

/**
 * Load the module as a /v8/ page framed by a parent at `parentOrigin`
 * (null: not framed at all; 'cross-origin': a parent whose location throws).
 */
const loadFramed = async (
  parentOrigin: string | null | 'cross-origin' = ORIGIN,
  baseUrl = '/v8/',
) => {
  vi.stubEnv('BASE_URL', baseUrl);
  vi.resetModules();
  const posted: Posted[] = [];
  const parent = {
    postMessage: (message: unknown, targetOrigin: string) => {
      posted.push({ message, targetOrigin });
    },
    get location() {
      if (parentOrigin === 'cross-origin') {
        throw new DOMException('Blocked a frame', 'SecurityError');
      }
      return { origin: parentOrigin };
    },
  };
  if (parentOrigin !== null) {
    vi.spyOn(window, 'parent', 'get').mockReturnValue(
      parent as unknown as Window,
    );
  }
  const embed = await import('../interviewer9Embed');
  return { embed, posted, parent };
};

/** A message event as the browser builds it; jsdom will not take a fake source. */
const deliver = (data: unknown, source: unknown, origin = ORIGIN) => {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: source });
  window.dispatchEvent(event);
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('whether the page is embedded in Interviewer 9', () => {
  it('is, as a /v8/ build framed by its own origin', async () => {
    const { embed } = await loadFramed(ORIGIN);
    expect(embed.IS_EMBEDDED_IN_INTERVIEWER_9).toBe(true);
  });

  it.each([
    ['not framed', null, '/v8/'],
    ['framed by another origin', 'https://elsewhere.example', '/v8/'],
    ['framed by a cross-origin page', 'cross-origin', '/v8/'],
    ['the root build, framed by its own origin', ORIGIN, '/'],
  ] as const)('is not, %s', async (_case, parentOrigin, baseUrl) => {
    const { embed, posted } = await loadFramed(parentOrigin, baseUrl);
    expect(embed.IS_EMBEDDED_IN_INTERVIEWER_9).toBe(false);
    // Nothing is said to a page that is not Interviewer 9's.
    expect(posted).toEqual([]);
    expect(await embed.interviewer9Unlock()).toBeNull();
  });

  it.each([
    ['framed by another origin', 'https://elsewhere.example', '/v8/', true],
    ['framed by a cross-origin page', 'cross-origin', '/v8/', true],
    ['framed by its own origin', ORIGIN, '/v8/', false],
    ['not framed', null, '/v8/', false],
    ['the root build, framed by another origin', 'cross-origin', '/', false],
  ] as const)(
    'knows whether it is framed by another origin: %s',
    async (_case, parentOrigin, baseUrl, expected) => {
      const { embed } = await loadFramed(parentOrigin, baseUrl);
      expect(embed.IS_FRAMED_BY_ANOTHER_ORIGIN).toBe(expected);
    },
  );
});

describe('the handshake', () => {
  it('says it is ready as it loads, to its own origin only', async () => {
    const { posted } = await loadFramed();
    expect(posted).toEqual([
      { message: { type: 'interviewer8:ready' }, targetOrigin: ORIGIN },
    ]);
  });

  it('takes the key and the enter authorization from the reply', async () => {
    const { embed, parent } = await loadFramed();
    const key = await dataKey();

    deliver(
      { type: 'interviewer9:unlock', key, enterAuthorized: true },
      parent,
    );

    expect(await embed.interviewer9Unlock()).toEqual({
      key,
      enterAuthorized: true,
    });
  });

  it('takes a reply without a key, from a device with no lock', async () => {
    const { embed, parent } = await loadFramed();

    deliver(
      { type: 'interviewer9:unlock', key: null, enterAuthorized: false },
      parent,
    );

    expect(await embed.interviewer9Unlock()).toEqual({
      key: null,
      enterAuthorized: false,
    });
  });

  it('ignores what does not come from its parent, at its own origin, in the agreed shape', async () => {
    vi.useFakeTimers();
    const { embed, parent } = await loadFramed();
    const key = await dataKey();
    const signingKey = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const reply = { type: 'interviewer9:unlock', key, enterAuthorized: true };

    deliver(reply, window); // not the parent
    deliver(reply, parent, 'https://elsewhere.example');
    deliver({ ...reply, type: 'unlock' }, parent);
    deliver({ ...reply, enterAuthorized: 'yes' }, parent);
    deliver({ ...reply, key: 'a key' }, parent);
    deliver({ ...reply, key: signingKey }, parent);
    deliver('interviewer9:unlock', parent);

    let settled: unknown = 'pending';
    void embed.interviewer9Unlock().then((value) => {
      settled = value;
    });
    await vi.advanceTimersByTimeAsync(
      embed.INTERVIEWER_9_UNLOCK_TIMEOUT_MS - 1,
    );
    expect(settled).toBe('pending');
    // The one that is right still counts.
    deliver({ ...reply, enterAuthorized: false }, parent);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toEqual({ key, enterAuthorized: false });
  });

  it('gives up after the timeout, and ignores a reply that comes later', async () => {
    vi.useFakeTimers();
    const { embed, parent } = await loadFramed();
    let settled: unknown = 'pending';
    void embed.interviewer9Unlock().then((value) => {
      settled = value;
    });

    await vi.advanceTimersByTimeAsync(
      embed.INTERVIEWER_9_UNLOCK_TIMEOUT_MS - 1,
    );
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();

    deliver(
      { type: 'interviewer9:unlock', key: null, enterAuthorized: true },
      parent,
    );
    expect(await embed.interviewer9Unlock()).toBeNull();
  });
});

describe('closing', () => {
  it('takes no key from a reply that arrives once it has closed', async () => {
    const { embed, parent } = await loadFramed();
    embed.markEmbedClosed();

    deliver(
      {
        type: 'interviewer9:unlock',
        key: await dataKey(),
        enterAuthorized: true,
      },
      parent,
    );

    expect(await embed.interviewer9Unlock()).toBeNull();
  });

  it('is marked once, telling every listener', async () => {
    const { embed } = await loadFramed();
    const listener = vi.fn();
    embed.subscribeEmbedClosed(listener);

    expect(embed.isEmbedClosed()).toBe(false);
    expect(embed.markEmbedClosed()).toBe(true);
    expect(embed.markEmbedClosed()).toBe(false);

    expect(embed.isEmbedClosed()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tells Interviewer 9, at its own origin, with no data', async () => {
    const { embed, posted } = await loadFramed();
    posted.length = 0;

    embed.postClosedToInterviewer9();

    expect(posted).toEqual([
      { message: { type: 'interviewer8:closed' }, targetOrigin: ORIGIN },
    ]);
  });
});
