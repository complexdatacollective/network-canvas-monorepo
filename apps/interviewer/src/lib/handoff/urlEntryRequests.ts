// Requests other apps make of this one through the URL they open. There is
// one: `/?from=architect`, which says Architect opened this tab to send it a
// protocol over postMessage (see `architectHandoff.ts`).
//
// Captured before anything else reads the URL (analytics records the page
// address as it initialises) and stripped with `history.replaceState`, so a
// reload, a bookmark or a page-view event never repeats or records it. A
// parameter that names another sender is dropped without being acted on.

const FROM_PARAM = 'from';
const FROM_ARCHITECT = 'architect';

let openedByArchitect = false;

/**
 * Read this app's entry parameter from `search`, and return the query string
 * without it (the empty string when nothing else was in it).
 */
export const parseUrlEntryRequests = (
  search: string,
): { fromArchitect: boolean; remainingSearch: string } => {
  const params = new URLSearchParams(search);
  const from = params.get(FROM_PARAM);
  params.delete(FROM_PARAM);
  const remaining = params.toString();
  return {
    fromArchitect: from === FROM_ARCHITECT,
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
  if (!new URLSearchParams(search).has(FROM_PARAM)) return;

  const { fromArchitect, remainingSearch } = parseUrlEntryRequests(search);
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${remainingSearch}${hash}`,
  );
  openedByArchitect = fromArchitect;
};

/** Whether Architect opened this page to send it a protocol, answered once. */
export const takeArchitectRequest = (): boolean => {
  const taken = openedByArchitect;
  openedByArchitect = false;
  return taken;
};
