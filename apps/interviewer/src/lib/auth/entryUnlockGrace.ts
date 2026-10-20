import { OPENED_INTERVIEW_SESSION_ID } from '~/lib/openedInterview';

// Interviewer 9 hosts each schema 8 interview by framing Interviewer 8 (a /v8/
// build) at /interview/<id> (see interviewer9Embed.ts). The researcher has
// already unlocked Interviewer 9, which hands its key over, and says whether
// it has also satisfied the "unlock to enter the interview" step. Without
// this, entering the interview here would then ask a second time, seconds
// later.
//
// So, only in a /v8/ build and only for the session at the `/interview/<id>`
// the page was opened at, either of these stands in for that step, once:
// Interviewer 9 saying it was satisfied, or, when Interviewer 9 did not hand
// the key over in time, an unlock at this page's own lock screen in the last
// minute. Entering anything else, or entering again (after the participant
// has left the interview, say), asks as usual. Everything lives in this
// page's memory; nothing written to storage can grant it.

export const ENTRY_UNLOCK_GRACE_MS = 60_000;

let unlockedAt: number | null = null;
let spent = false;

/** Record an unlock at the lock screen (StepUpAuthProvider). */
export const noteLockScreenUnlock = (now: number = Date.now()): void => {
  if (!spent) unlockedAt = now;
};

/**
 * Record that Interviewer 9 has already satisfied the enter step for the
 * interview this page was opened for (auth/api.ts adoptInterviewer9Unlock).
 */
export const noteInterviewer9EntryAuthorization = (
  now: number = Date.now(),
): void => {
  noteLockScreenUnlock(now);
};

/** Give up the grace for the rest of this page load, used or not. */
export const endEntryUnlockGrace = (): void => {
  spent = true;
  unlockedAt = null;
};

/**
 * Whether the "unlock to enter the interview" step may be skipped for the
 * session `sessionId` now. A true answer uses the grace up.
 */
export const takeEntryUnlockGrace = (
  sessionId: string,
  now: number = Date.now(),
): boolean => {
  const granted =
    !spent &&
    OPENED_INTERVIEW_SESSION_ID === sessionId &&
    unlockedAt !== null &&
    now >= unlockedAt &&
    now - unlockedAt <= ENTRY_UNLOCK_GRACE_MS;
  if (granted) endEntryUnlockGrace();
  return granted;
};
