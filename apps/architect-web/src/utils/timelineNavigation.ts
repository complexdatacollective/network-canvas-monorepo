// Resolve a main-timeline entry's recorded `path` into the page the user should
// be on to see that change undone/redone. Committed stage edits collapse to the
// stage list (`/protocol`) rather than re-opening the editor, so the main
// timeline and the stage editor's draft history never share a screen. Every
// other path resolves to itself.
const STAGE_PREFIX = '/protocol/stage/';

export const resolveTimelineNavTarget = (path: string): string =>
  path.startsWith(STAGE_PREFIX) ? '/protocol' : path;
