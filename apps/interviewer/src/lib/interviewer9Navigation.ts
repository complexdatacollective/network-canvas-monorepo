import { toAppPath } from '~/lib/appBase';
import { whenSessionWritesSettle } from '~/lib/db/api';
import { setSessionDek } from '~/lib/db/sessionKey';
import {
  IS_EMBEDDED_IN_INTERVIEWER_9,
  markEmbedClosed,
  postClosedToInterviewer9,
} from '~/lib/interviewer9Embed';
import { isHistoryBackGuardEntry } from '~/lib/pwa/useHistoryBackGuard';

// Interviewer 9 is served at the origin root, with Interviewer 8 (a /v8/
// build) inside its deploy. Interviewer 9 hosts each schema 8 interview in an
// iframe at /v8/interview/<id> (see interviewer9Embed.ts), and that is the
// only way this build runs one. Interviewer 9's addresses belong to another
// app, so wouter's router must not handle them.

const INTERVIEW_PATH = /^\/interview\/[^/?#]+$/;

/**
 * Where Interviewer 9 shows what a top-level load of this page asked for: its
 * own /interview/<id> (search kept, so a review stays a review), which hosts
 * the interview, or its home for any other address.
 */
export const interviewer9AddressFor = (
  location: Pick<Location, 'pathname' | 'search'>,
): string => {
  const path = toAppPath(location.pathname);
  return INTERVIEW_PATH.test(path) ? `${path}${location.search}` : '/';
};

// A write still on its way to the database dies with this document once
// Interviewer 9 removes the iframe. Two seconds is far more than the local
// writes it waits on need; a stalled one must not keep the interview open.
const CLOSE_DRAIN_TIMEOUT_MS = 2_000;
// history.back() lands as a popstate; never wait on one forever.
const CLOSE_POP_TIMEOUT_MS = 1_000;

const within = (promise: Promise<unknown>, ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    void promise
      .catch(() => undefined)
      .then(() => {
        window.clearTimeout(timer);
        resolve();
      });
  });

const popHistoryBackGuardEntry = (): Promise<void> => {
  if (!isHistoryBackGuardEntry(window.history.state)) return Promise.resolve();
  const popped = new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
  window.history.back();
  return within(popped, CLOSE_POP_TIMEOUT_MS);
};

async function closeEmbeddedInterview(): Promise<void> {
  // Stops rendering at once (App.tsx); a second close does nothing.
  if (!markEmbedClosed()) return;
  // An exit through the interview's own guard has popped its history entry
  // already. One left behind (by the lock screen raised over a guarded
  // interview, say) is popped here, so Interviewer 9's Back never replays it.
  await popHistoryBackGuardEntry();
  await within(whenSessionWritesSettle(), CLOSE_DRAIN_TIMEOUT_MS);
  // The key Interviewer 9 handed over has done its work: drop it before the
  // frame goes, however long the host keeps the frame (a write after this
  // fails rather than landing in plaintext; recordCrypto.ts).
  setSessionDek(null);
  postClosedToInterviewer9();
}

/**
 * Leave this page for Interviewer 9. Embedded, that ends the interview: tell
 * Interviewer 9, which removes the iframe. At the top level, replace the page
 * with where Interviewer 9 shows the same thing, so Back from there does not
 * return to a page that only sends it on again.
 */
export const returnToInterviewer9 = (): void => {
  if (IS_EMBEDDED_IN_INTERVIEWER_9) {
    void closeEmbeddedInterview();
    return;
  }
  window.location.replace(interviewer9AddressFor(window.location));
};
