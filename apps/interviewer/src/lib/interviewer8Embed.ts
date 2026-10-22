// Interviewer 9's side of hosting a schema 8 interview: Interviewer 8 (the
// /v8/ build) runs in a full-viewport, same-origin iframe at
// /v8/interview/<id> (components/Interviewer8Frame.tsx), and the two pages
// talk only by postMessage, at this origin, as Interviewer 8's
// lib/interviewer9Embed.ts expects:
//
//   1. Interviewer 8 posts { type: 'interviewer8:ready' } once it can receive;
//   2. this app answers, once per mounted frame,
//      { type: 'interviewer9:unlock', key, enterAuthorized }: `key` is this
//      app's in-memory data-encryption key (the CryptoKey itself, structured-
//      cloned, never exported) or null when the device has no lock, and
//      `enterAuthorized` says this app has already satisfied the "unlock to
//      enter the interview" step for this session, so Interviewer 8 does not
//      ask a second time;
//   3. Interviewer 8 posts { type: 'interviewer8:closed' } when its interview
//      ends, for any reason, and this app takes the frame away.
//
// A message counts only from the frame's own window and from this origin.

/** What Interviewer 8 sends its host. */
export type Interviewer8Message = 'ready' | 'closed';

/** The host's one answer to 'ready'. */
type Interviewer9UnlockMessage = {
  type: 'interviewer9:unlock';
  key: CryptoKey | null;
  enterAuthorized: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * What `event` says, when it is a message Interviewer 8 sent from `frame`
 * (the iframe's window) at this origin; null for anything else.
 */
export function readInterviewer8Message(
  event: MessageEvent,
  frame: Window | null,
  origin: string = window.location.origin,
): Interviewer8Message | null {
  if (frame === null || event.source !== frame) return null;
  if (event.origin !== origin) return null;
  if (!isObject(event.data)) return null;
  if (event.data.type === 'interviewer8:ready') return 'ready';
  if (event.data.type === 'interviewer8:closed') return 'closed';
  return null;
}

/** Answer Interviewer 8's 'ready' in `frame`, at this origin only. */
export function postUnlockToInterviewer8(
  frame: Window,
  unlock: { key: CryptoKey | null; enterAuthorized: boolean },
  origin: string = window.location.origin,
): void {
  const message: Interviewer9UnlockMessage = {
    type: 'interviewer9:unlock',
    key: unlock.key,
    enterAuthorized: unlock.enterAuthorized,
  };
  frame.postMessage(message, origin);
}

/** The path every page of the bundled Interviewer 8 is served under. */
const INTERVIEWER_8_PATH = '/v8/';

/**
 * Whether `frame` (the iframe's window) shows a page of Interviewer 8 at this
 * origin. False for the frame's initial blank page, for a page of this app,
 * and for any page of another origin (reading its location throws).
 */
export function frameShowsInterviewer8(
  frame: Window | null,
  origin: string = window.location.origin,
): boolean {
  if (frame === null) return false;
  try {
    return (
      frame.location.origin === origin &&
      frame.location.pathname.startsWith(INTERVIEWER_8_PATH)
    );
  } catch {
    return false;
  }
}
