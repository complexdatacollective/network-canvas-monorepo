import { toAppPath } from '~/lib/appBase';

const INTERVIEW_RECOVERY_RESTRICTION_KEY =
  'interviewer:interview-recovery-restricted';

// Accepts a router path (`/interview/<id>`, from wouter under its base) and a
// browser path (`window.location.pathname`, which carries the base in a /v8/
// build) alike. The recovery restriction depends on this: a destructive reset
// must never be offered over an interview, whichever base the app runs under.
export function isInterviewRoutePath(path: string): boolean {
  return /^\/interview\//i.test(toAppPath(path));
}

export function readInterviewRecoveryRestriction(): boolean {
  try {
    return (
      window.sessionStorage.getItem(INTERVIEW_RECOVERY_RESTRICTION_KEY) ===
      'true'
    );
  } catch {
    return false;
  }
}

export function persistInterviewRecoveryRestriction(): void {
  try {
    window.sessionStorage.setItem(INTERVIEW_RECOVERY_RESTRICTION_KEY, 'true');
  } catch {
    // The in-memory lock-cycle restriction still applies when storage fails.
  }
}

export function clearInterviewRecoveryRestriction(): void {
  try {
    window.sessionStorage.removeItem(INTERVIEW_RECOVERY_RESTRICTION_KEY);
  } catch {
    // A later successful unlock still removes the in-memory lock screen.
  }
}
