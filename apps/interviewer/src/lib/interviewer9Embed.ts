import { IS_SUBPATH_BUILD } from './appBase';

// Interviewer 9 hosts a schema 8 interview by rendering Interviewer 8 (a /v8/
// build) in a full-viewport, same-origin iframe at /v8/interview/<id>, with
// ?mode=review for a review. The researcher has already unlocked Interviewer
// 9, so the two pages talk once, by postMessage, and Interviewer 8 never asks
// for the lock a second time:
//
//   1. this page posts { type: 'interviewer8:ready' } to its parent as soon as
//      it can receive (this module is the first one main.tsx imports);
//   2. Interviewer 9 replies { type: 'interviewer9:unlock', key, enterAuthorized }:
//      `key` is the lock's data-encryption key (a non-extractable AES-GCM
//      CryptoKey, structured-cloned) or null when the device has no lock, and
//      `enterAuthorized` says Interviewer 9 has already satisfied the "unlock
//      to enter the interview" step for this session;
//   3. this page holds that key as an unlock at its own lock screen would
//      (auth/api.ts adoptInterviewer9Unlock), and, with `enterAuthorized`,
//      skips its enter gate (auth/entryUnlockGrace.ts). With no reply within
//      INTERVIEWER_9_UNLOCK_TIMEOUT_MS it shows its own lock screen, so the
//      interview is never stuck;
//   4. when the interview ends, for any reason, it posts
//      { type: 'interviewer8:closed' } and renders nothing more
//      (interviewer9Navigation.ts). That and 'ready' are all it ever sends: it
//      carries no data, and nothing is sent when this page locks.
//
// Both directions use targetOrigin = this origin, and a message counts only
// from the parent window, at this origin. Kept free of imports beyond appBase
// so that it runs, and listens, before the rest of the app has loaded.
//
// What the host owes the frame: `allow="fullscreen; publickey-credentials-get;
// clipboard-write; autoplay"` (a video's fullscreen control, biometric unlock
// and step-up, the interview's copy buttons, muted autoplaying video) and no
// `sandbox`; its own safe-area padding around the frame (env(safe-area-inset-*)
// reads zero inside an iframe on iOS, so the interview cannot pad itself); a
// frame sized to the host's visual viewport; and no history entries of its
// own pushed while the frame is shown (the interview's Back guard and its
// close both traverse the joint session history); and its own lock raised
// when the frame goes away without 'closed' (its idle timer never sees taps
// inside the frame). Its /v8/* responses must allow framing by the same
// origin only (frame-ancestors 'self'); until they do, this page framed by
// another origin renders nothing and goes nowhere (IS_FRAMED_BY_ANOTHER_ORIGIN).

/** How long to wait for Interviewer 9's reply before showing the lock screen. */
export const INTERVIEWER_9_UNLOCK_TIMEOUT_MS = 5_000;

export type Interviewer9Unlock = {
  key: CryptoKey | null;
  enterAuthorized: boolean;
};

const hasSameOriginParent = (): boolean => {
  if (typeof window === 'undefined' || window.parent === window) return false;
  try {
    // Throws for a cross-origin parent.
    return window.parent.location.origin === window.location.origin;
  } catch {
    return false;
  }
};

/**
 * Whether this page is a /v8/ build framed by a page of its own origin, which
 * is how Interviewer 9 hosts it. Always false in the root build.
 */
export const IS_EMBEDDED_IN_INTERVIEWER_9: boolean =
  IS_SUBPATH_BUILD && hasSameOriginParent();

/**
 * Whether this /v8/ page is framed by a page of another origin. It then
 * renders nothing and goes nowhere: sending that frame on to Interviewer 9
 * would put Interviewer 9's unlock inside a page it does not trust.
 */
export const IS_FRAMED_BY_ANOTHER_ORIGIN: boolean =
  IS_SUBPATH_BUILD &&
  typeof window !== 'undefined' &&
  window.parent !== window &&
  !IS_EMBEDDED_IN_INTERVIEWER_9;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A data-encryption key: an AES-GCM secret that can encrypt and decrypt. */
const isDataKey = (value: unknown): value is CryptoKey =>
  typeof CryptoKey !== 'undefined' &&
  value instanceof CryptoKey &&
  value.type === 'secret' &&
  value.algorithm.name === 'AES-GCM' &&
  value.usages.includes('encrypt') &&
  value.usages.includes('decrypt');

const readUnlockMessage = (data: unknown): Interviewer9Unlock | null => {
  if (!isObject(data) || data.type !== 'interviewer9:unlock') return null;
  if (typeof data.enterAuthorized !== 'boolean') return null;
  if (data.key !== null && !isDataKey(data.key)) return null;
  return { key: data.key, enterAuthorized: data.enterAuthorized };
};

const postToInterviewer9 = (
  type: 'interviewer8:ready' | 'interviewer8:closed',
): void => {
  window.parent.postMessage({ type }, window.location.origin);
};

let closed = false;
const closedListeners = new Set<() => void>();

/** Whether this embedded interview has ended; nothing renders once it has. */
export const isEmbedClosed = (): boolean => closed;

export const subscribeEmbedClosed = (listener: () => void): (() => void) => {
  closedListeners.add(listener);
  return () => closedListeners.delete(listener);
};

/** Mark the embedded interview ended. True the first time only. */
export const markEmbedClosed = (): boolean => {
  if (closed) return false;
  closed = true;
  for (const listener of closedListeners) listener();
  return true;
};

const awaitUnlock = (): Promise<Interviewer9Unlock | null> =>
  new Promise((resolve) => {
    const settle = (reply: Interviewer9Unlock | null) => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(reply);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.origin !== window.location.origin) return;
      // A page that has already closed (it was framed for an interview it
      // cannot run, say) takes no key.
      if (closed) {
        settle(null);
        return;
      }
      const reply = readUnlockMessage(event.data);
      if (reply) settle(reply);
    };
    const timer = window.setTimeout(
      () => settle(null),
      INTERVIEWER_9_UNLOCK_TIMEOUT_MS,
    );
    window.addEventListener('message', onMessage);
    postToInterviewer9('interviewer8:ready');
  });

const unlock: Promise<Interviewer9Unlock | null> = IS_EMBEDDED_IN_INTERVIEWER_9
  ? awaitUnlock()
  : Promise.resolve(null);

/**
 * Interviewer 9's reply to 'ready', or null: not embedded, no valid reply
 * within the timeout. A reply arriving after the timeout is ignored.
 */
export const interviewer9Unlock = (): Promise<Interviewer9Unlock | null> =>
  unlock;

/** Tell Interviewer 9 the embedded interview has ended. */
export const postClosedToInterviewer9 = (): void => {
  postToInterviewer9('interviewer8:closed');
};
