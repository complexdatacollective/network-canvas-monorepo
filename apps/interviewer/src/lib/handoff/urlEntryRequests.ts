// Requests Interviewer 8 makes of this app through the URL it navigates to:
//
// - `/?import=<handoffKey>`: import the file Interviewer 8 staged in the
//   hand-off store (a newer file it could not read, or one an Interviewer 8
//   window was launched with).
//
// Captured before anything else reads the URL (analytics records the page
// address as it initialises) and stripped with `history.replaceState`, so a
// reload, a bookmark or a page-view event never repeats or records it. A value
// that is not shaped like a hand-off key is dropped without being acted on.

import { isHandoffKey } from './handoffStore';

const IMPORT_PARAM = 'import';

let pendingImport: string | undefined;

/**
 * Read this app's entry parameter from `search`, keeping it only when it is
 * well formed, and return the query string without it (the empty string when
 * nothing else was in it).
 */
export const parseUrlEntryRequests = (
  search: string,
): { importHandoffKey: string | undefined; remainingSearch: string } => {
  const params = new URLSearchParams(search);
  const handoff = params.get(IMPORT_PARAM);
  params.delete(IMPORT_PARAM);
  const remaining = params.toString();
  return {
    importHandoffKey:
      handoff !== null && isHandoffKey(handoff) ? handoff : undefined,
    remainingSearch: remaining ? `?${remaining}` : '',
  };
};

let captured = false;

/**
 * Take this app's entry parameter out of the current URL and hold it for the
 * code that acts on it. Safe to call more than once; only the first call reads
 * the URL.
 */
export const captureUrlEntryRequests = (): void => {
  if (captured || typeof window === 'undefined') return;
  captured = true;
  const { search, pathname, hash } = window.location;
  if (!new URLSearchParams(search).has(IMPORT_PARAM)) return;

  const { importHandoffKey, remainingSearch } = parseUrlEntryRequests(search);
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${remainingSearch}${hash}`,
  );
  pendingImport = importHandoffKey;
};

/** The staged file this page was asked to import, handed out once. */
export const takeImportRequest = (): string | undefined => {
  const taken = pendingImport;
  pendingImport = undefined;
  return taken;
};
