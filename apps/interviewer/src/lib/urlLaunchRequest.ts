// Reads what Interviewer was asked to do by its URL, and removes the request
// from the address bar.
//
// Interviewer 9 hands schema 8 work to this app by navigating to
//
//   <base>?start=<protocolHash>   open the new-interview form for a protocol
//   <base>?import=<handoffKey>    import a file staged in the hand-off store
//
// Both are one-shot: the parameters are stripped with `history.replaceState`
// as soon as this module is evaluated, so a reload or a bookmark never repeats
// the request, and main.tsx imports this module first, before anything that
// could start analytics, so the hash or key never reaches an analytics event's
// URL. Keep this module a leaf: anything it imports is evaluated before it.
//
// The requests are honoured only once the app is unlocked (Home consumes them
// behind the auth gate); in a root build they are harmless.

export type UrlLaunchRequest =
  | { kind: 'start'; protocolHash: string }
  | { kind: 'import'; handoffKey: string };

const START_PARAM = 'start';
const IMPORT_PARAM = 'import';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A protocol's hash is ohash's base64url digest (43 characters). The bounded
// token also admits the fixed hashes e2e seeds use, and nothing that could
// carry a path, a query or markup.
const PROTOCOL_HASH_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

type ParsedUrlLaunch = {
  /** The request, or null when there is none or it is malformed. */
  request: UrlLaunchRequest | null;
  /** The query string with this module's parameters removed, `?` included. */
  search: string;
  /** Whether either parameter was present, valid or not. */
  present: boolean;
};

/**
 * Parse a `location.search`. A request is accepted only when exactly one of
 * the two parameters appears, once, with a well-formed value; anything else is
 * ignored. Either way both parameters are removed from the returned search.
 */
export const parseUrlLaunchRequest = (search: string): ParsedUrlLaunch => {
  const params = new URLSearchParams(search);
  const starts = params.getAll(START_PARAM);
  const imports = params.getAll(IMPORT_PARAM);
  const present = starts.length > 0 || imports.length > 0;

  params.delete(START_PARAM);
  params.delete(IMPORT_PARAM);
  const rest = params.toString();

  let request: UrlLaunchRequest | null = null;
  if (starts.length === 1 && imports.length === 0) {
    const [protocolHash = ''] = starts;
    if (PROTOCOL_HASH_PATTERN.test(protocolHash)) {
      request = { kind: 'start', protocolHash };
    }
  } else if (imports.length === 1 && starts.length === 0) {
    const [handoffKey = ''] = imports;
    if (UUID_PATTERN.test(handoffKey)) request = { kind: 'import', handoffKey };
  }

  return { request, search: rest === '' ? '' : `?${rest}`, present };
};

/** Read the request from the current URL and strip it from the address bar. */
export const captureUrlLaunchRequest = (
  target: Pick<Window, 'location' | 'history'>,
): UrlLaunchRequest | null => {
  const { pathname, search, hash } = target.location;
  const parsed = parseUrlLaunchRequest(search);
  if (!parsed.present) return null;
  try {
    target.history.replaceState(
      target.history.state,
      '',
      `${pathname}${parsed.search}${hash}`,
    );
  } catch {
    // A sandboxed document can refuse history writes. The request is still
    // honoured; it is only left visible in the address bar.
  }
  return parsed.request;
};

let pending: UrlLaunchRequest | null =
  typeof window === 'undefined' ? null : captureUrlLaunchRequest(window);

// Remembered after the request itself is taken: what the page was opened for
// decides whether a recent unlock may stand in for the enter gate
// (entryUnlockGrace).
const openingStartRequest =
  pending?.kind === 'start' ? pending.protocolHash : null;

/** The protocol hash of the well-formed `?start=` this page was opened by. */
export const getOpeningStartRequest = (): string | null => openingStartRequest;

/** The `?start=` request still waiting for its consumer, without taking it. */
export const peekUrlStartRequest = (): string | null =>
  pending?.kind === 'start' ? pending.protocolHash : null;

/** Hand the `?start=` request to its consumer, once. */
export const takeUrlStartRequest = (): string | null => {
  if (pending?.kind !== 'start') return null;
  const { protocolHash } = pending;
  pending = null;
  return protocolHash;
};

/** Hand the `?import=` request to its consumer, once. */
export const takeUrlImportRequest = (): string | null => {
  if (pending?.kind !== 'import') return null;
  const { handoffKey } = pending;
  pending = null;
  return handoffKey;
};
