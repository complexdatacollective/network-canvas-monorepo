// Requests other apps make of this one through the URL they open:
//
// - `/?import=<handoffKey>`: import the file Interviewer 8 staged in the
//   hand-off store (a newer file it could not read, or one an Interviewer 8
//   window was launched with).
// - `/?from=architect`: Architect opened this tab to send it a protocol over
//   postMessage (see `architectHandoff.ts`).
//
// Captured before anything else reads the URL (analytics records the page
// address as it initialises) and stripped with `history.replaceState`, so a
// reload, a bookmark or a page-view event never repeats or records it. A value
// that is not shaped like a hand-off key, or names another sender, is dropped
// without being acted on.

import { isHandoffKey } from './handoffStore';

const IMPORT_PARAM = 'import';
const FROM_PARAM = 'from';
const FROM_ARCHITECT = 'architect';

let pendingImport: string | undefined;
let openedByArchitect = false;

/**
 * Read this app's entry parameters from `search`, keeping each only when it is
 * well formed, and return the query string without them (the empty string
 * when nothing else was in it).
 */
export const parseUrlEntryRequests = (
  search: string,
): {
  importHandoffKey: string | undefined;
  fromArchitect: boolean;
  remainingSearch: string;
} => {
  const params = new URLSearchParams(search);
  const handoff = params.get(IMPORT_PARAM);
  const from = params.get(FROM_PARAM);
  params.delete(IMPORT_PARAM);
  params.delete(FROM_PARAM);
  const remaining = params.toString();
  return {
    importHandoffKey:
      handoff !== null && isHandoffKey(handoff) ? handoff : undefined,
    fromArchitect: from === FROM_ARCHITECT,
    remainingSearch: remaining ? `?${remaining}` : '',
  };
};

let captured = false;

/**
 * Take this app's entry parameters out of the current URL and hold them for
 * the code that acts on them. Safe to call more than once; only the first call
 * reads the URL.
 */
export const captureUrlEntryRequests = (): void => {
  if (captured || typeof window === 'undefined') return;
  captured = true;
  const { search, pathname, hash } = window.location;
  const params = new URLSearchParams(search);
  if (!params.has(IMPORT_PARAM) && !params.has(FROM_PARAM)) return;

  const { importHandoffKey, fromArchitect, remainingSearch } =
    parseUrlEntryRequests(search);
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${remainingSearch}${hash}`,
  );
  pendingImport = importHandoffKey;
  openedByArchitect = fromArchitect;
};

/** The staged file this page was asked to import, handed out once. */
export const takeImportRequest = (): string | undefined => {
  const taken = pendingImport;
  pendingImport = undefined;
  return taken;
};

/** Whether Architect opened this page to send it a protocol, answered once. */
export const takeArchitectRequest = (): boolean => {
  const taken = openedByArchitect;
  openedByArchitect = false;
  return taken;
};
