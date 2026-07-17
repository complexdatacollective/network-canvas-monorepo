const INTERVIEW_RECOVERY_RESTRICTION_KEY =
  'interviewer:interview-recovery-restricted';

export function isInterviewRoutePath(path: string): boolean {
  return /^\/interview\//i.test(path);
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
