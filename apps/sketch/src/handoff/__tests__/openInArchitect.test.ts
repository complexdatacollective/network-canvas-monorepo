import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleResult } from '../../__tests__/fixtures.ts';
import {
  HANDOFF_TIMEOUT_MS,
  openInArchitect,
  READY_TIMEOUT_MS,
  type SketchImportPayload,
} from '../openInArchitect.ts';

const ARCHITECT = 'https://architect.example.test';

// Real Window objects stand in for the Architect tab and a stranger, because
// MessageEvent only accepts a real window as its source.
const makeWindow = (): Window => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const win = frame.contentWindow;
  if (!win) throw new Error('no iframe window');
  return win;
};

const post = (source: Window, data: unknown, origin = ARCHITECT) =>
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));

const input = () => {
  const { protocol, assets, summary } = sampleResult();
  return { protocol, assets, name: summary.name };
};

let popup: Window;
let popupPost: ReturnType<typeof vi.spyOn>;
let open: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  popup = makeWindow();
  popupPost = vi.spyOn(popup, 'postMessage').mockImplementation(() => {});
  open = vi.spyOn(window, 'open').mockReturnValue(popup);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('openInArchitect', () => {
  it('opens the import page in a new tab without noopener', () => {
    void openInArchitect(input(), { architectUrl: ARCHITECT });
    expect(open).toHaveBeenCalledWith(
      `${ARCHITECT}/import-from-sketch`,
      '_blank',
    );
  });

  it('reports blocked when the browser refuses the tab', async () => {
    open.mockReturnValue(null);
    await expect(
      openInArchitect(input(), { architectUrl: ARCHITECT }),
    ).resolves.toBe('blocked');
  });

  it('answers ready once with the payload, targeted at Architect', async () => {
    const outcome = openInArchitect(input(), { architectUrl: ARCHITECT });

    post(popup, { type: 'sketch-import:ready', version: 1 });
    post(popup, { type: 'sketch-import:ready', version: 1 });

    expect(popupPost).toHaveBeenCalledTimes(1);
    const [message, targetOrigin] = popupPost.mock.calls[0] ?? [];
    expect(targetOrigin).toBe(ARCHITECT);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reading back what the code posted
    const payload = message as SketchImportPayload;
    expect(payload.type).toBe('sketch-import:payload');
    expect(payload.version).toBe(1);
    expect(payload.name).toBe('Friendship and Wellbeing');
    expect(payload.protocol).toEqual(input().protocol);
    expect(payload.assets).toHaveLength(1);
    expect(payload.assets[0]?.id).toBe('roster');
    expect(payload.assets[0]?.name).toBe('classmates.csv');
    expect(payload.assets[0]?.data).toBeInstanceOf(Blob);
    expect(await payload.assets[0]?.data.text()).toBe('name\nAda\n');

    post(popup, { type: 'sketch-import:result', version: 1, status: 'opened' });
    await expect(outcome).resolves.toBe('opened');
  });

  it('ignores messages from the wrong origin or another window', async () => {
    const outcome = openInArchitect(input(), { architectUrl: ARCHITECT });
    const stranger = makeWindow();

    post(
      popup,
      { type: 'sketch-import:ready', version: 1 },
      'https://evil.example.test',
    );
    post(stranger, { type: 'sketch-import:ready', version: 1 });
    post(stranger, {
      type: 'sketch-import:result',
      version: 1,
      status: 'opened',
    });
    post(popup, { type: 'sketch-import:ready', version: 2 });
    expect(popupPost).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    await expect(outcome).resolves.toBe('timeout');
  });

  it('waits out a slow cold load longer than the result timeout', async () => {
    const outcome = openInArchitect(input(), { architectUrl: ARCHITECT });
    await vi.advanceTimersByTimeAsync(HANDOFF_TIMEOUT_MS + 10_000);
    post(popup, { type: 'sketch-import:ready', version: 1 });
    expect(popupPost).toHaveBeenCalledTimes(1);
    post(popup, { type: 'sketch-import:result', version: 1, status: 'opened' });
    await expect(outcome).resolves.toBe('opened');
  });

  it('settles at once when the Architect tab is closed', async () => {
    const outcome = openInArchitect(input(), { architectUrl: ARCHITECT });
    Object.defineProperty(popup, 'closed', {
      configurable: true,
      get: () => true,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(outcome).resolves.toBe('timeout');
  });

  it('times out when Architect never says it is ready', async () => {
    const outcome = openInArchitect(input(), { architectUrl: ARCHITECT });
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1);
    let settled = false;
    void outcome.then(() => {
      settled = true;
      return undefined;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toBe('timeout');
  });

  it('times out when Architect takes the payload but never answers', async () => {
    const outcome = openInArchitect(input(), { architectUrl: ARCHITECT });
    await vi.advanceTimersByTimeAsync(5_000);
    post(popup, { type: 'sketch-import:ready', version: 1 });
    expect(popupPost).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HANDOFF_TIMEOUT_MS);
    await expect(outcome).resolves.toBe('timeout');
  });

  it("reports Architect's error with its message", async () => {
    const onError = vi.fn();
    const outcome = openInArchitect(input(), {
      architectUrl: ARCHITECT,
      onError,
    });
    post(popup, { type: 'sketch-import:ready', version: 1 });
    post(popup, {
      type: 'sketch-import:result',
      version: 1,
      status: 'error',
      message: 'That protocol is not valid.',
    });
    await expect(outcome).resolves.toBe('error');
    expect(onError).toHaveBeenCalledWith('That protocol is not valid.');
  });

  it('stops listening once settled', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const outcome = openInArchitect(input(), { architectUrl: ARCHITECT });
    post(popup, { type: 'sketch-import:ready', version: 1 });
    post(popup, { type: 'sketch-import:result', version: 1, status: 'opened' });
    await outcome;
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
