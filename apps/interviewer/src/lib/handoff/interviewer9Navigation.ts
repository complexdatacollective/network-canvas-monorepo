// Interviewer 9 is served at the origin root, with Interviewer 8 (a /v8/
// build) inside its deploy. Interviewer 9's addresses are root-absolute, never
// under this build's base, and each is reached by a full-page navigation: they
// belong to another app, so wouter's router must not handle them.

/** Interviewer 9's home, where the shared lock is managed. */
export const INTERVIEWER_9_HOME_URL = '/';

/** Interviewer 9's import flow, for a file staged in the hand-off store. */
export const interviewer9ImportUrl = (handoffKey: string): string =>
  `/?import=${encodeURIComponent(handoffKey)}`;

/** The full-page navigation itself, kept here so tests can stand in for it. */
export const leaveForInterviewer9 = (url: string): void => {
  window.location.assign(url);
};

/**
 * Hand this page over to Interviewer 9 without leaving it in history: Back
 * from Interviewer 9 must not return to a page that only sends it on again.
 */
export const replaceWithInterviewer9 = (): void => {
  window.location.replace(INTERVIEWER_9_HOME_URL);
};
