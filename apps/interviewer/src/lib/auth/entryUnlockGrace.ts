import { IS_SUBPATH_BUILD } from '~/lib/appBase';
import { wasOpenedByStartRequest } from '~/lib/urlLaunchRequest';

import { isInterviewRoutePath } from './interviewRecoveryRestriction';

// Interviewer 9 starts and resumes schema 8 interviews by opening Interviewer
// 8 (a /v8/ build) with a full-page navigation. The lock's key never leaves a
// page's memory, so Interviewer 8 asks to unlock again on arrival. Without
// this, starting an interview there would then ask a second time, at the
// "unlock to enter the interview" step, seconds later.
//
// So an unlock at the lock screen in the last minute stands in for that step,
// but only in a /v8/ build, and only on a page Interviewer 9 opened for an
// interview: by `?start=<protocolHash>`, or at `/interview/<id>`. Everything
// lives in this page's memory; nothing written to storage can grant it.

export const ENTRY_UNLOCK_GRACE_MS = 60_000;

// Read as the app's modules are evaluated, before any navigation within it.
const openedOnInterviewRoute =
  typeof window !== 'undefined' &&
  isInterviewRoutePath(window.location.pathname);

let unlockedAt: number | null = null;

/** Record an unlock at the lock screen (StepUpAuthProvider). */
export const noteLockScreenUnlock = (now: number = Date.now()): void => {
  unlockedAt = now;
};

/** Whether the "unlock to enter the interview" step may be skipped now. */
export const hasEntryUnlockGrace = (now: number = Date.now()): boolean =>
  IS_SUBPATH_BUILD &&
  (openedOnInterviewRoute || wasOpenedByStartRequest()) &&
  unlockedAt !== null &&
  now >= unlockedAt &&
  now - unlockedAt <= ENTRY_UNLOCK_GRACE_MS;
