// Reads the protocol Architect was asked to open by its URL, and removes the
// request from the address bar.
//
// Architect 9 hands a schema 8 protocol to this app by navigating to
//
//   <base>?open=<libraryProtocolId>   a row of this app's own library
//   <base>?import=<handoffKey>        a file staged in the hand-off store
//
// Both are one-shot: the parameters are stripped with `history.replaceState`
// as soon as this module is evaluated, so a reload or a bookmark never repeats
// the request. `~/analytics` imports this module ahead of its `posthog.init`,
// which records the first page view, so the ids never reach analytics. Keep
// this module a leaf: anything it imports is evaluated first, and an import
// that reached `~/analytics` would be a cycle that undoes that ordering.

export type UrlLaunchRequest =
  | { kind: 'open'; protocolId: string }
  | { kind: 'import'; handoffKey: string };

const OPEN_PARAM = 'open';
const IMPORT_PARAM = 'import';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Library rows are keyed by `crypto.randomUUID()`; the bounded token also
// admits the fixed ids the e2e seed uses, and nothing that could carry a path,
// a query or markup.
const LIBRARY_ROW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const isLibraryRowId = (value: string): boolean =>
  LIBRARY_ROW_ID_PATTERN.test(value);

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
  const opens = params.getAll(OPEN_PARAM);
  const imports = params.getAll(IMPORT_PARAM);
  const present = opens.length > 0 || imports.length > 0;

  params.delete(OPEN_PARAM);
  params.delete(IMPORT_PARAM);
  const rest = params.toString();

  let request: UrlLaunchRequest | null = null;
  if (opens.length === 1 && imports.length === 0) {
    const [protocolId = ''] = opens;
    if (isLibraryRowId(protocolId)) request = { kind: 'open', protocolId };
  } else if (imports.length === 1 && opens.length === 0) {
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

/** Hand the `?open=` request to its consumer, once. */
export const takeUrlOpenRequest = (): string | null => {
  if (pending?.kind !== 'open') return null;
  const { protocolId } = pending;
  pending = null;
  return protocolId;
};

/** Hand the `?import=` request to its consumer, once. */
export const takeUrlImportRequest = (): string | null => {
  if (pending?.kind !== 'import') return null;
  const { handoffKey } = pending;
  pending = null;
  return handoffKey;
};
