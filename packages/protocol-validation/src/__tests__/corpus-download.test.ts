import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CORPUS_DOWNLOAD_BUDGET_MS,
  downloadAndDecryptProtocols,
} from './utils.ts';

/**
 * A server that accepts the request and then says nothing.
 *
 * It settles only when the request is aborted, which is what `fetch` itself
 * does — so a download with no bound on it never settles at all, and that is
 * exactly the failure this guards.
 */
const stubStalledFetch = () => {
  vi.stubGlobal(
    'fetch',
    (_input: unknown, init?: Readonly<{ signal?: AbortSignal }>) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('The operation was aborted.'));
        });
      }),
  );
};

/**
 * The corpus is downloaded while the test file is being LOADED — a test per
 * protocol needs its cases before any hook has run — so no Vitest hook or test
 * timeout governs it. The suite owns the bound instead, and this is the only
 * place it can be proven: reaching it for real means waiting five minutes on a
 * GitHub outage.
 */
describe('the test-protocol corpus download', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('gives up on a request that never answers, and says so', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GITHUB_TOKEN', 'token-for-a-server-that-never-answers');
    stubStalledFetch();

    const settled = vi.fn();
    const download = downloadAndDecryptProtocols().then(settled, settled);

    // Nothing has happened a moment before the budget runs out, so what ends
    // the download below is the bound rather than the stub giving up on its
    // own — a download that resolved by itself would pass the rejection
    // assertion without the bound existing at all.
    await vi.advanceTimersByTimeAsync(CORPUS_DOWNLOAD_BUDGET_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await download;

    // In the suite's own words, naming the corpus and the budget: the runtime
    // reports an abort as "The operation was aborted", which says neither.
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'The test-protocol corpus did not finish downloading within 300s. The GitHub release API or the release asset did not respond.',
      }),
    );
  });

  it('leaves no timer running once the download has failed', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GITHUB_TOKEN', 'token-for-a-server-that-refuses');
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('connection refused')),
    );

    await expect(downloadAndDecryptProtocols()).rejects.toThrow(
      'connection refused',
    );

    // A budget timer left behind would keep Node's event loop alive past the
    // run, and would abort a controller nothing is listening to.
    expect(vi.getTimerCount()).toBe(0);
  });
});
