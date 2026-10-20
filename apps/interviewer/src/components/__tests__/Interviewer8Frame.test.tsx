import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setSessionDek } from '~/lib/db/sessionKey';

const { auth, releaseHold, holdIdleLock, showsInterviewer8 } = vi.hoisted(
  () => {
    const release = vi.fn();
    return {
      auth: { mode: 'pin' as 'pin' | 'none' | undefined },
      releaseHold: release,
      holdIdleLock: vi.fn(() => release),
      // jsdom loads nothing into a frame, so it stays on about:blank; this
      // stands in for the address check.
      showsInterviewer8: { current: true },
    };
  },
);
vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => auth,
}));
vi.mock('~/lib/auth/idle', () => ({ holdIdleLock }));
vi.mock('~/lib/interviewer8Embed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/interviewer8Embed')>()),
  frameShowsInterviewer8: () => showsInterviewer8.current,
}));

const { Interviewer8Frame } = await import('../Interviewer8Frame');

// The session key Interviewer 9 holds; any object stands in for the
// CryptoKey, which is handed over as it is.
const dek = { type: 'secret' } as unknown as CryptoKey;

const renderFrame = (enterAuthorized = true) => {
  const onClosed = vi.fn();
  const onLost = vi.fn();
  const onUnavailable = vi.fn();
  const view = render(
    <Interviewer8Frame
      src="/v8/interview/s1"
      enterAuthorized={enterAuthorized}
      onClosed={onClosed}
      onLost={onLost}
      onUnavailable={onUnavailable}
    />,
  );
  const frame = screen.getByTitle<HTMLIFrameElement>('Interview');
  const frameWindow = frame.contentWindow;
  if (!frameWindow) throw new Error('the frame has no window');
  const posted = vi.spyOn(frameWindow, 'postMessage');
  return {
    ...view,
    frame,
    frameWindow,
    posted,
    onClosed,
    onLost,
    onUnavailable,
  };
};

const fromFrame = (
  source: Window | null,
  type: string,
  origin: string = window.location.origin,
) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type }, origin, source }),
    );
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mode = 'pin';
  showsInterviewer8.current = true;
  setSessionDek(dek);
});

afterEach(() => {
  setSessionDek(null);
});

describe('Interviewer8Frame', () => {
  it('frames Interviewer 8 with what it needs from the browser, and no sandbox', () => {
    const { frame } = renderFrame();
    expect(frame).toHaveAttribute('src', '/v8/interview/s1');
    expect(frame).toHaveAttribute(
      'allow',
      'fullscreen; publickey-credentials-get; clipboard-write; autoplay',
    );
    expect(frame).not.toHaveAttribute('sandbox');
  });

  it("answers 'ready' with the session key and the enter authorization, once, at this origin", () => {
    const { frameWindow, posted } = renderFrame(true);

    fromFrame(frameWindow, 'interviewer8:ready');
    fromFrame(frameWindow, 'interviewer8:ready');

    expect(posted).toHaveBeenCalledTimes(1);
    expect(posted).toHaveBeenCalledWith(
      { type: 'interviewer9:unlock', key: dek, enterAuthorized: true },
      window.location.origin,
    );
  });

  it('hands over no key on a device with no lock', () => {
    auth.mode = 'none';
    const { frameWindow, posted } = renderFrame(false);

    fromFrame(frameWindow, 'interviewer8:ready');

    expect(posted).toHaveBeenCalledWith(
      { type: 'interviewer9:unlock', key: null, enterAuthorized: false },
      window.location.origin,
    );
  });

  it('answers nothing that comes from another window or another origin', () => {
    const { frameWindow, posted, onClosed } = renderFrame();

    fromFrame(window, 'interviewer8:ready');
    fromFrame(frameWindow, 'interviewer8:ready', 'https://elsewhere.example');
    fromFrame(window, 'interviewer8:closed');
    fromFrame(frameWindow, 'interviewer8:closed', 'https://elsewhere.example');

    expect(posted).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('hands nothing to a frame that does not show Interviewer 8, and reports it lost', () => {
    showsInterviewer8.current = false;
    const { frameWindow, posted, onLost } = renderFrame();

    fromFrame(frameWindow, 'interviewer8:ready');

    expect(posted).not.toHaveBeenCalled();
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("reports 'closed' once", () => {
    const { frameWindow, onClosed, onLost } = renderFrame();

    fromFrame(frameWindow, 'interviewer8:ready');
    fromFrame(frameWindow, 'interviewer8:closed');
    fromFrame(frameWindow, 'interviewer8:closed');

    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('reports the frame lost when its page goes away without closing', () => {
    const { frameWindow, onLost, onClosed } = renderFrame();

    fromFrame(frameWindow, 'interviewer8:ready');
    act(() => {
      frameWindow.dispatchEvent(new Event('pagehide'));
    });

    expect(onLost).toHaveBeenCalledTimes(1);
    // Nothing it says afterwards counts.
    fromFrame(frameWindow, 'interviewer8:closed');
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('reports the frame lost when it loads a second page', () => {
    const { frame, onLost } = renderFrame();

    act(() => {
      frame.dispatchEvent(new Event('load'));
    });
    expect(onLost).not.toHaveBeenCalled();
    act(() => {
      frame.dispatchEvent(new Event('load'));
    });

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('reports a first page that is not Interviewer 8 as unavailable, not lost', () => {
    // Offline before Interviewer 8 was saved: the browser's error page, which
    // is of another origin and throws on any call from here.
    showsInterviewer8.current = false;
    const { frame, frameWindow, onLost, onUnavailable } = renderFrame();
    vi.spyOn(frameWindow, 'removeEventListener').mockImplementation(() => {
      throw new DOMException('Blocked a frame', 'SecurityError');
    });

    act(() => {
      frame.dispatchEvent(new Event('load'));
    });

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('reports a second page that is not Interviewer 8 as lost', () => {
    const { frame, onLost, onUnavailable } = renderFrame();
    act(() => {
      frame.dispatchEvent(new Event('load'));
    });

    showsInterviewer8.current = false;
    act(() => {
      frame.dispatchEvent(new Event('load'));
    });

    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('does not read its own removal as the frame being lost', () => {
    const { frameWindow, unmount, onLost } = renderFrame();
    fromFrame(frameWindow, 'interviewer8:ready');

    unmount();
    frameWindow.dispatchEvent(new Event('pagehide'));

    expect(onLost).not.toHaveBeenCalled();
  });

  it('holds the idle lock while it is shown', () => {
    const { unmount } = renderFrame();
    expect(holdIdleLock).toHaveBeenCalledTimes(1);
    expect(releaseHold).not.toHaveBeenCalled();

    unmount();

    expect(releaseHold).toHaveBeenCalledTimes(1);
  });
});
