// Decide where — if anywhere — the researcher should be moved so that one
// history operation becomes visible to them. `recordedPath` is the page the
// timeline entry was committed on; `currentPath` is where they are now.
// Returns `''` to stay put, which is also the answer whenever moving would
// reveal nothing.

const SUMMARY_PAGE = '/protocol/summary';

// Pages that host the project history controls AND render the protocol state a
// change recorded there touches, so returning to one reveals the result.
const REVEALING_PAGES = new Set([
  '/protocol',
  '/protocol/assets',
  '/protocol/codebook',
]);

// Committed stage edits collapse to the stage list rather than re-opening the
// editor, so the main timeline and the stage editor's draft history never share
// a screen. The list shows stages appearing, disappearing and being renamed; an
// edit to a stage's internals is not itself visible there, but the stage list
// owns the changed object and carries the history controls, which no other page
// does.
const STAGE_EDITOR_PREFIX = '/protocol/stage/';

// The page that would reveal a change recorded at `path`, or '' if there is
// none. A whitelist rather than "return the path unchanged", so a locus
// recorded somewhere unexpected can never route the researcher out of the
// protocol editor.
const revealingPageFor = (path: string): string => {
  if (REVEALING_PAGES.has(path)) return path;
  if (path.startsWith(STAGE_EDITOR_PREFIX)) return '/protocol';

  // Everything else has no page that would reveal the change:
  // - `/protocol/experiments` records real protocol mutations but renders its
  //   own toolbar with no history controls, is reachable only by typing the
  //   URL, and its toggles are invisible from the stage list.
  // - `/protocol/summary` is a report view that mutates nothing.
  // - A path-less entry (non-browser environments) records no page at all.
  return '';
};

export const resolveTimelineNavTarget = (
  recordedPath: string,
  currentPath: string,
): string => {
  // The Summary report renders the whole protocol, so a change undone while
  // reading it is already visible there. Moving the researcher would take them
  // out of the report to show them something the report was showing anyway.
  if (currentPath === SUMMARY_PAGE) return '';

  const target = revealingPageFor(recordedPath);
  return target && target !== currentPath ? target : '';
};
