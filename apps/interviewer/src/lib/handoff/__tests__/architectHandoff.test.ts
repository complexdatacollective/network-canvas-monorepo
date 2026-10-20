import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ARCHITECT = 'https://architect.networkcanvas.com';

const payload = (overrides: Record<string, unknown> = {}) => ({
  type: 'interviewer-handoff:payload',
  version: 1,
  fileName: 'Study.netcanvas',
  file: new Blob(['zip-bytes'], { type: 'application/zip' }),
  ...overrides,
});

let opener: { postMessage: ReturnType<typeof vi.fn> } | null;

const setOpener = (value: typeof opener) => {
  opener = value;
  Object.defineProperty(window, 'opener', { value, configurable: true });
};

// Module state (the captured URL, the launch queue) lives per page, so each
// test loads fresh copies.
const load = async (url: string) => {
  window.history.replaceState(null, '', url);
  vi.resetModules();
  const queue = await import('../../pwa/fileLaunchQueue');
  const { captureUrlEntryRequests } = await import('../urlEntryRequests');
  const handoff = await import('../architectHandoff');
  captureUrlEntryRequests();
  handoff.startArchitectHandoff();
  return { queue, handoff };
};

const post = (data: unknown, { source = opener, origin = ARCHITECT } = {}) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      source: source as unknown as MessageEventSource,
      origin,
    }),
  );
};

const readyMessage = { type: 'interviewer-handoff:ready', version: 1 };
const result = (status: string) => ({
  type: 'interviewer-handoff:result',
  version: 1,
  status,
});

beforeEach(() => {
  vi.useFakeTimers();
  setOpener({ postMessage: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  setOpener(null);
  window.history.replaceState(null, '', '/');
});

describe('startArchitectHandoff', () => {
  it('asks its opener for the protocol until one arrives, then queues it', async () => {
    const { queue } = await load('/?from=architect');
    // The marker is gone from the address before anything records it.
    expect(window.location.search).toBe('');

    expect(opener?.postMessage).toHaveBeenCalledWith(readyMessage, '*');
    vi.advanceTimersByTime(2_000);
    expect(opener?.postMessage).toHaveBeenCalledTimes(3);

    post(payload());
    expect(opener?.postMessage).toHaveBeenLastCalledWith(
      result('received'),
      ARCHITECT,
    );

    vi.useRealTimers();
    await vi.waitFor(() => {
      expect(queue.getLaunchFiles().map(({ name }) => name)).toEqual([
        'Study.netcanvas',
      ]);
    });

    // Asking stops once the payload is in.
    const calls = opener?.postMessage.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(opener?.postMessage.mock.calls.length).toBe(calls);
  });

  it('does nothing when the page was not opened by Architect', async () => {
    const { queue } = await load('/');
    expect(opener?.postMessage).not.toHaveBeenCalled();
    post(payload());
    expect(queue.hasPendingLaunchFiles()).toBe(false);
  });

  it('does nothing without an opener', async () => {
    setOpener(null);
    const { queue } = await load('/?from=architect');
    expect(queue.hasPendingLaunchFiles()).toBe(false);
  });

  it('ignores a payload from another window or an unknown origin', async () => {
    const { queue } = await load('/?from=architect');

    post(payload(), { source: { postMessage: vi.fn() } });
    post(payload(), { origin: 'https://evil.example' });
    post(payload(), {
      origin: 'https://architect.networkcanvas.com.evil.example',
    });

    expect(queue.hasPendingLaunchFiles()).toBe(false);
    expect(opener?.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'interviewer-handoff:result' }),
      expect.anything(),
    );

    // Still listening: the genuine payload is accepted afterwards.
    post(payload());
    expect(queue.hasPendingLaunchFiles()).toBe(true);
  });

  it('answers a malformed payload with an error and queues nothing', async () => {
    const { queue } = await load('/?from=architect');
    post(payload({ file: 'not a file' }));
    expect(opener?.postMessage).toHaveBeenLastCalledWith(
      result('error'),
      ARCHITECT,
    );
    expect(queue.hasPendingLaunchFiles()).toBe(false);

    // One answer per page: a later valid payload is not taken.
    post(payload());
    expect(queue.hasPendingLaunchFiles()).toBe(false);
  });

  it('stops asking after the wait runs out', async () => {
    const { queue, handoff } = await load('/?from=architect');
    vi.advanceTimersByTime(handoff.PAYLOAD_TIMEOUT_MS);
    const calls = opener?.postMessage.mock.calls.length;
    vi.advanceTimersByTime(5_000);
    expect(opener?.postMessage.mock.calls.length).toBe(calls);

    post(payload());
    expect(queue.hasPendingLaunchFiles()).toBe(false);
  });
});
