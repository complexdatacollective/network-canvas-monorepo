import { IS_SUBPATH_BUILD, toAppPath } from '~/lib/appBase';
import { getOpeningStartRequest } from '~/lib/urlLaunchRequest';

// Interviewer 9 starts and resumes schema 8 interviews by opening Interviewer
// 8 (a /v8/ build) with a full-page navigation. The lock's key never leaves a
// page's memory, so Interviewer 8 asks to unlock again on arrival. Without
// this, starting an interview there would then ask a second time, at the
// "unlock to enter the interview" step, seconds later.
//
// So an unlock at the lock screen in the last minute stands in for that step,
// but only in a /v8/ build, only on a page Interviewer 9 opened for an
// interview, and only for that interview: the protocol named by
// `?start=<protocolHash>`, or the session at `/interview/<id>`. It stands in
// once. Entering anything else, or entering again (after the participant has
// left the interview, say), asks as usual. Everything lives in this page's
// memory; nothing written to storage can grant it.

export const ENTRY_UNLOCK_GRACE_MS = 60_000;

/** What is being entered: a new interview of a protocol, or a session. */
export type EntryTarget = { protocolHash: string } | { sessionId: string };

const INTERVIEW_PATH = /^\/interview\/([^/?#]+)/i;

const sessionIdInPath = (path: string): string | null => {
  const segment = INTERVIEW_PATH.exec(toAppPath(path))?.[1];
  if (segment === undefined) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

// Read as the app's modules are evaluated, before any navigation within it.
const openedFor = (): EntryTarget | null => {
  const protocolHash = getOpeningStartRequest();
  if (protocolHash !== null) return { protocolHash };
  if (typeof window === 'undefined') return null;
  const sessionId = sessionIdInPath(window.location.pathname);
  return sessionId === null ? null : { sessionId };
};
const openingTarget = IS_SUBPATH_BUILD ? openedFor() : null;

const isSameTarget = (a: EntryTarget, b: EntryTarget): boolean =>
  'protocolHash' in a
    ? 'protocolHash' in b && a.protocolHash === b.protocolHash
    : 'sessionId' in b && a.sessionId === b.sessionId;

let unlockedAt: number | null = null;
let spent = false;

/** Record an unlock at the lock screen (StepUpAuthProvider). */
export const noteLockScreenUnlock = (now: number = Date.now()): void => {
  if (!spent) unlockedAt = now;
};

/** Give up the grace for the rest of this page load, used or not. */
export const endEntryUnlockGrace = (): void => {
  spent = true;
  unlockedAt = null;
};

/**
 * Whether the "unlock to enter the interview" step may be skipped for
 * `target` now. A true answer uses the grace up.
 */
export const takeEntryUnlockGrace = (
  target: EntryTarget,
  now: number = Date.now(),
): boolean => {
  const granted =
    !spent &&
    openingTarget !== null &&
    isSameTarget(openingTarget, target) &&
    unlockedAt !== null &&
    now >= unlockedAt &&
    now - unlockedAt <= ENTRY_UNLOCK_GRACE_MS;
  if (granted) endEntryUnlockGrace();
  return granted;
};
