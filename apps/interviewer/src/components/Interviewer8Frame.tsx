import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useAuth } from '~/lib/auth/AuthContext';
import { holdIdleLock } from '~/lib/auth/idle';
import { getSessionDek } from '~/lib/db/sessionKey';
import {
  frameShowsInterviewer8,
  postUnlockToInterviewer8,
  readInterviewer8Message,
} from '~/lib/interviewer8Embed';

const messages = defineMessages({
  title: {
    id: 'interviewer.interviewer8Frame.title',
    defaultMessage: 'Interview',
    description:
      'Accessible name of the full-screen frame in which an interview made with an older protocol schema runs. Read by screen readers only.',
  },
});

// What the frame needs from the browser: a video's fullscreen control,
// biometric unlock and step-up (WebAuthn), the interview's copy buttons and
// muted autoplaying video. No `sandbox`: Interviewer 8 is this origin's own
// app and needs its storage, workers and scripts.
const FRAME_ALLOW =
  'fullscreen; publickey-credentials-get; clipboard-write; autoplay';

type Interviewer8FrameProps = {
  /** `/v8/interview/<id>`, with `?mode=review` for a review. */
  src: string;
  /** Whether this app has already satisfied the enter step for the session. */
  enterAuthorized: boolean;
  /** Interviewer 8 said its interview has ended. */
  onClosed: () => void;
  /**
   * The frame's page went away without saying so: it crashed, was reloaded,
   * or navigated somewhere that is not Interviewer 8.
   */
  onLost: () => void;
  /**
   * The frame's first page is not Interviewer 8 (offline before Interviewer 8
   * was saved for offline use, the browser shows its error page there), so
   * nothing ran and nothing was handed over.
   */
  onUnavailable: () => void;
};

/**
 * Interviewer 8 running a schema 8 interview, inside this app (see
 * lib/interviewer8Embed.ts for the messages the two exchange).
 *
 * The researcher has already unlocked here, so the frame is handed this
 * app's key and Interviewer 8 never shows its own lock screen on the way in.
 * While the frame is shown this app's idle lock is held (taps inside the
 * frame never reach it; Interviewer 8 runs its own idle lock there).
 *
 * The frame is padded by the top safe-area inset (and the side insets in
 * landscape), in the interview's background colour: inside an iframe on iOS
 * env(safe-area-inset-*) reads zero, so Interviewer 8 cannot pad itself. It
 * fills #root, which follows the visual viewport while the on-screen keyboard
 * is open (lib/pwa/visualViewportSizing.ts).
 */
export function Interviewer8Frame({
  src,
  enterAuthorized,
  onClosed,
  onLost,
  onUnavailable,
}: Interviewer8FrameProps) {
  const intl = useAppIntl();
  const { mode } = useAuth();
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Read when 'ready' arrives, not when the frame mounts.
  const unlockForFrame = useEffectEvent(() => ({
    key: mode !== undefined && mode !== 'none' ? getSessionDek() : null,
    enterAuthorized,
  }));
  const reportClosed = useEffectEvent(() => onClosed());
  const reportLost = useEffectEvent(() => onLost());
  const reportUnavailable = useEffectEvent(() => onUnavailable());

  useEffect(() => holdIdleLock(), []);

  // A layout effect so its cleanup, which detaches every listener, runs
  // before the iframe leaves the DOM: removing it unloads its page, and that
  // unload must not read as the frame being lost.
  useLayoutEffect(() => {
    const mounted = frameRef.current;
    if (!mounted) return undefined;
    // Typed apart from the ref, so the listeners below see it as present.
    const frame: HTMLIFrameElement = mounted;
    let ended = false;
    let answered = false;
    let loads = 0;

    const onPageHide = () => end('lost');
    const watchPage = () => {
      // Attaches to the page the frame shows now; a later page is a new
      // target that this listener does not follow.
      frame.contentWindow?.addEventListener('pagehide', onPageHide);
    };
    const detach = () => {
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', onLoad);
      try {
        frame.contentWindow?.removeEventListener('pagehide', onPageHide);
      } catch {
        // The frame shows a page of another origin now (the browser's error
        // page, say), which takes no calls from here; the listener went with
        // the page it was attached to.
      }
    };
    function end(how: 'closed' | 'lost' | 'unavailable') {
      if (ended) return;
      ended = true;
      detach();
      if (how === 'closed') reportClosed();
      else if (how === 'unavailable') reportUnavailable();
      else reportLost();
    }

    function onMessage(event: MessageEvent) {
      if (ended) return;
      const message = readInterviewer8Message(event, frame.contentWindow);
      if (message === 'closed') {
        end('closed');
        return;
      }
      if (message !== 'ready' || answered) return;
      const target = frame.contentWindow;
      if (!target || !frameShowsInterviewer8(target)) {
        end('lost');
        return;
      }
      answered = true;
      watchPage();
      postUnlockToInterviewer8(target, unlockForFrame());
    }

    function onLoad() {
      if (ended) return;
      loads += 1;
      // One page per mounted frame: a second load is a reload, or a
      // navigation inside the frame, neither of which says 'closed'.
      if (loads > 1) {
        end('lost');
        return;
      }
      if (!frameShowsInterviewer8(frame.contentWindow)) {
        // The first page never was Interviewer 8: nothing can have run in
        // it, and it was handed nothing, so this is explained, not locked.
        end(answered ? 'lost' : 'unavailable');
        return;
      }
      watchPage();
    }

    window.addEventListener('message', onMessage);
    frame.addEventListener('load', onLoad);
    return () => {
      ended = true;
      detach();
    };
  }, []);

  return (
    <div className="bg-background flex h-full w-full flex-col pt-[env(safe-area-inset-top)] landscape:pr-[env(safe-area-inset-right)] landscape:pl-[env(safe-area-inset-left)]">
      <iframe
        ref={frameRef}
        src={src}
        title={intl.formatMessage(messages.title)}
        allow={FRAME_ALLOW}
        data-testid="interviewer-8-frame"
        className="block min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}
