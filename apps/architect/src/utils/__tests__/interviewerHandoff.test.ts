import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deliverToInterviewer,
  type InterviewerTab,
  openInterviewerTab,
} from '../interviewerHandoff';

const ORIGIN = 'http://localhost:5180';

const ready = { type: 'interviewer-handoff:ready', version: 1 };
const result = (status: string) => ({
  type: 'interviewer-handoff:result',
  version: 1,
  status,
});

const makeTab = (): InterviewerTab & {
  window: { postMessage: ReturnType<typeof vi.fn>; closed: boolean };
} =>
  ({
    window: { postMessage: vi.fn(), closed: false },
    origin: ORIGIN,
  }) as unknown as InterviewerTab & {
    window: { postMessage: ReturnType<typeof vi.fn>; closed: boolean };
  };

const reply = (
  tab: { window: unknown },
  data: unknown,
  origin: string = ORIGIN,
) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      source: tab.window as MessageEventSource,
      origin,
    }),
  );
};

const file = { blob: new Blob(['zip']), fileName: 'Study.netcanvas' };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('openInterviewerTab', () => {
  it('opens the matching Interviewer, keeping the opener', () => {
    const tab = { closed: false };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as Window);

    // Tests run as a development build, which targets the local dev server.
    expect(openInterviewerTab()).toEqual({ window: tab, origin: ORIGIN });
    expect(open).toHaveBeenCalledWith(`${ORIGIN}/?from=architect`, '_blank');
  });

  it('returns null when the tab is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openInterviewerTab()).toBeNull();
  });
});

describe('deliverToInterviewer', () => {
  it('sends the file once on ready and resolves with the answer', async () => {
    const tab = makeTab();
    const outcome = deliverToInterviewer(tab, file);

    reply(tab, ready);
    reply(tab, ready);
    expect(tab.window.postMessage).toHaveBeenCalledTimes(1);
    expect(tab.window.postMessage).toHaveBeenCalledWith(
      {
        type: 'interviewer-handoff:payload',
        version: 1,
        fileName: 'Study.netcanvas',
        file: file.blob,
      },
      ORIGIN,
    );

    reply(tab, result('received'));
    await expect(outcome).resolves.toBe('received');
  });

  it('passes on an error answer', async () => {
    const tab = makeTab();
    const outcome = deliverToInterviewer(tab, file);
    reply(tab, ready);
    reply(tab, result('error'));
    await expect(outcome).resolves.toBe('error');
  });

  it('ignores messages from another window or origin', async () => {
    const tab = makeTab();
    const outcome = deliverToInterviewer(tab, file, { readyTimeoutMs: 1_000 });

    reply({ window: { postMessage: vi.fn() } }, ready);
    reply(tab, ready, 'https://evil.example');
    expect(tab.window.postMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    await expect(outcome).resolves.toBe('not-reached');
  });

  it('gives up when Interviewer never answers the payload', async () => {
    const tab = makeTab();
    const outcome = deliverToInterviewer(tab, file, { resultTimeoutMs: 500 });
    reply(tab, ready);
    vi.advanceTimersByTime(500);
    await expect(outcome).resolves.toBe('not-reached');
  });

  it('settles as soon as the tab is closed', async () => {
    const tab = makeTab();
    const outcome = deliverToInterviewer(tab, file);
    tab.window.closed = true;
    vi.advanceTimersByTime(500);
    await expect(outcome).resolves.toBe('not-reached');
  });
});
