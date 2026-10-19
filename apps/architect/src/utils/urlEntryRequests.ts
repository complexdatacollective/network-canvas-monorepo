// Requests Architect 8 makes of this app through the URL it navigates to:
//
// - `/?upgrade=<legacyProtocolId>`: show the upgrade confirmation for that
//   protocol in Architect 8's library (its "Upgrade to schema 9" action).
// - `/?import=<handoffKey>`: open the file Architect 8 staged in the hand-off
//   store (a file an Architect 8 window was launched with).
//
// Captured before anything else reads the URL — analytics records the page
// address as it initialises — and stripped with `history.replaceState`, so a
// reload, a bookmark or the page-view event never repeats or records them. A
// value that is not shaped like an id is dropped without being acted on.

import { isHandoffKey } from './handoffStore';

type UrlEntryRequests = {
  /** An Architect 8 library row to offer the upgrade for. */
  upgradeLegacyId?: string;
  /** A hand-off record staged for this app. */
  importHandoffKey?: string;
};

const UPGRADE_PARAM = 'upgrade';
const IMPORT_PARAM = 'import';

// Architect 8 names its library rows with `crypto.randomUUID()`.
const LEGACY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isLegacyProtocolId = (value: string): boolean =>
  LEGACY_ID_PATTERN.test(value);

let pendingUpgrade: string | undefined;
let pendingImport: string | undefined;

/**
 * Read this app's entry parameters from `search`, keeping only well-formed
 * values, and return the query string with both removed (the empty string when
 * nothing else was in it).
 */
export const parseUrlEntryRequests = (
  search: string,
): { requests: UrlEntryRequests; remainingSearch: string } => {
  const params = new URLSearchParams(search);
  const upgrade = params.get(UPGRADE_PARAM);
  const handoff = params.get(IMPORT_PARAM);
  params.delete(UPGRADE_PARAM);
  params.delete(IMPORT_PARAM);
  const remaining = params.toString();
  return {
    requests: {
      upgradeLegacyId:
        upgrade !== null && isLegacyProtocolId(upgrade) ? upgrade : undefined,
      importHandoffKey:
        handoff !== null && isHandoffKey(handoff) ? handoff : undefined,
    },
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
  if (!params.has(UPGRADE_PARAM) && !params.has(IMPORT_PARAM)) return;

  const { requests, remainingSearch } = parseUrlEntryRequests(search);
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${remainingSearch}${hash}`,
  );
  pendingUpgrade = requests.upgradeLegacyId;
  pendingImport = requests.importHandoffKey;
};

/** The staged file this page was asked to open, handed out once. */
export const takeImportRequest = (): string | undefined => {
  const taken = pendingImport;
  pendingImport = undefined;
  return taken;
};

/** The Architect 8 protocol this page was asked to upgrade, handed out once. */
export const takeUpgradeRequest = (): string | undefined => {
  const taken = pendingUpgrade;
  pendingUpgrade = undefined;
  return taken;
};
