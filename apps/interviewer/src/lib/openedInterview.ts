import { IS_SUBPATH_BUILD, toAppPath } from '~/lib/appBase';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) is only ever opened at
// /interview/<id>, by Interviewer 9, to run that one interview: every exit
// leaves the page for Interviewer 9, so the interview the page was opened for
// is the only one it ever runs. What that is decides whether a recent unlock
// may stand in for the enter gate (entryUnlockGrace) and the one row the page
// may write (db/sessionRowWriteScope).

const INTERVIEW_PATH = /^\/interview\/([^/?#]+)/i;

/** The session id in an app path's `/interview/<id>`, or null. */
const sessionIdInPath = (path: string): string | null => {
  const segment = INTERVIEW_PATH.exec(toAppPath(path))?.[1];
  if (segment === undefined) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

/**
 * In a /v8/ build, the session at the `/interview/<id>` this page was opened
 * at; null for any other address, and always in the root build. Read as the
 * app's modules are evaluated, before any navigation within it.
 */
export const OPENED_INTERVIEW_SESSION_ID: string | null =
  IS_SUBPATH_BUILD && typeof window !== 'undefined'
    ? sessionIdInPath(window.location.pathname)
    : null;
