import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Leaving for Interviewer 9: framed, by ending the embedded interview; at the
// top level, by handing the address to Interviewer 9's own.

const mocks = vi.hoisted(() => ({
  embedded: true,
  closed: false,
  log: [] as string[],
  settle: vi.fn(async () => undefined),
}));

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  toAppPath: (path: string) => path.replace(/^\/v8(?=\/|$)/, '') || '/',
}));
vi.mock('~/lib/interviewer9Embed', () => ({
  get IS_EMBEDDED_IN_INTERVIEWER_9() {
    return mocks.embedded;
  },
  markEmbedClosed: () => {
    if (mocks.closed) return false;
    mocks.closed = true;
    mocks.log.push('closed');
    return true;
  },
  postClosedToInterviewer9: () => mocks.log.push('told Interviewer 9'),
}));
vi.mock('~/lib/db/sessionKey', () => ({
  setSessionDek: (key: CryptoKey | null) =>
    mocks.log.push(key === null ? 'key dropped' : 'key held'),
}));
vi.mock('~/lib/db/api', () => ({
  whenSessionWritesSettle: () => mocks.settle(),
}));

import {
  interviewer9AddressFor,
  returnToInterviewer9,
} from '../interviewer9Navigation';

const at = (pathname: string, search = '') => ({ pathname, search });

beforeEach(() => {
  mocks.embedded = true;
  mocks.closed = false;
  mocks.log = [];
  mocks.settle.mockImplementation(async () => {
    mocks.log.push('writes settled');
  });
  window.history.replaceState(null, '', '/v8/interview/s1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the address Interviewer 9 shows a top-level load at', () => {
  it('is its own interview route for an interview, with the review kept', () => {
    expect(interviewer9AddressFor(at('/v8/interview/s1'))).toBe(
      '/interview/s1',
    );
    expect(interviewer9AddressFor(at('/v8/interview/s1', '?mode=review'))).toBe(
      '/interview/s1?mode=review',
    );
    // Already encoded in the path; kept as it is.
    expect(interviewer9AddressFor(at('/v8/interview/a%2Fb'))).toBe(
      '/interview/a%2Fb',
    );
  });

  it.each(['/v8/', '/v8', '/v8/data', '/v8/interview/', '/v8/interview/s1/x'])(
    'is its home for anything else (%s)',
    (pathname) => {
      expect(interviewer9AddressFor(at(pathname, '?mode=review'))).toBe('/');
    },
  );
});

describe('returning to Interviewer 9, framed', () => {
  it('ends the interview, lets its writes land, drops the key, then tells Interviewer 9, once', async () => {
    returnToInterviewer9();
    returnToInterviewer9();

    await vi.waitFor(() => expect(mocks.log).toContain('told Interviewer 9'));
    expect(mocks.log).toEqual([
      'closed',
      'writes settled',
      'key dropped',
      'told Interviewer 9',
    ]);
  });

  it('does not wait on a stalled write for ever', async () => {
    vi.useFakeTimers();
    mocks.settle.mockReturnValue(new Promise(() => {}));

    returnToInterviewer9();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(mocks.log).toEqual(['closed']);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.log).toEqual(['closed', 'key dropped', 'told Interviewer 9']);
  });

  it('first pops an interview history entry left behind, so Back in Interviewer 9 never replays it', async () => {
    window.history.pushState({ ncBackGuard: true }, '', '/v8/interview/s1');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {
      mocks.log.push('popped');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    returnToInterviewer9();

    await vi.waitFor(() => expect(mocks.log).toContain('told Interviewer 9'));
    expect(back).toHaveBeenCalledTimes(1);
    expect(mocks.log).toEqual([
      'closed',
      'popped',
      'writes settled',
      'key dropped',
      'told Interviewer 9',
    ]);
  });

  it('does not navigate the frame anywhere', () => {
    const replace = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      replace,
    });

    returnToInterviewer9();

    expect(replace).not.toHaveBeenCalled();
  });
});

describe('returning to Interviewer 9 at the top level', () => {
  it('replaces the page with Interviewer 9’s address for it', () => {
    mocks.embedded = false;
    const replace = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      pathname: '/v8/interview/s1',
      search: '?mode=review',
      replace,
    });

    returnToInterviewer9();

    expect(replace).toHaveBeenCalledWith('/interview/s1?mode=review');
    expect(mocks.log).toEqual([]);
  });
});
