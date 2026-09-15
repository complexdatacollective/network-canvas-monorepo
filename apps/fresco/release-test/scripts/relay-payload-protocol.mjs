// The wire contract and the privacy oracle for the analytics lane.
//
// The other lanes ask whether a deployment with analytics DISABLED stays
// silent, which a connection sink answers completely (relay-sink.mjs). This
// one asks the opposite question — what a deployment with analytics ENABLED
// actually puts on the wire — and that can only be answered by reading the
// payloads. Everything here is pure: the sink writes records, the reader
// decodes and judges them, and both sides import this module, so the oracle is
// exercised on synthetic records rather than only through a running stack
// (`scripts/release-test/fresco-release-test-analytics.test.mjs`).
//
// The governing rule, inherited from the connection sink: a payload that
// cannot be read is a violation, never a silence. Every negative assertion
// below is preceded by a positive control, because "no session replay in the
// payloads" is satisfied exactly as well by a lane that captured nothing.
import { gunzipSync, inflateSync } from 'node:zlib';

/** Where the payload sink writes, inside its container. */
export const CAPTURE_DIR = '/opt/relay-capture';

/** Where the certificate up.sh mints is mounted, inside its container. */
export const TLS_DIR = '/opt/relay-tls';

/** The capture file for a lane, inside the sink's container. */
export const captureFile = (lane) => `${CAPTURE_DIR}/${lane}.jsonl`;

/**
 * Request paths that belong to posthog-js's initialisation rather than to an
 * event. They are the positive control that matters most: `init()` is the real
 * consent gate — it fetches the remote config, every extension the config
 * names and the feature flags before any `capture()` happens — so a lane whose
 * browser never initialised proves nothing about what an enabled deployment
 * sends, however many events it did or did not see.
 */
const INIT_PATHS = [/^\/array\//, /^\/flags\b/, /^\/decide\b/];
export const isInitPath = (path) =>
  INIT_PATHS.some((pattern) => pattern.test(path));

/**
 * Session-recording ingestion. posthog-js posts snapshots to /s/ regardless of
 * the event pipeline, so the path is checked as well as the event name.
 */
export const isSessionRecordingPath = (path) => /^\/s\/?(\?|$)/.test(path);

/** Events whose payload is element data or a full page URL. */
export const ELEMENT_EVENTS = [
  '$autocapture',
  '$rageclick',
  '$dead_click',
  '$$heatmap',
];

/** Element-derived properties posthog-js may attach to any event. */
export const ELEMENT_PROPERTIES = ['$elements', '$elements_chain', '$el_text'];

/** Properties carrying an entity's primary key (see @codaco/interview). */
export const ENTITY_ID_PROPERTIES = [
  'node_id',
  'edge_id',
  'node_a_id',
  'node_b_id',
  'entity_id',
];

/**
 * The fixed vocabulary `getProtocolFileErrorKind` reports.
 *
 * Named here so a `ProtocolImportFailed` carrying something else — a file
 * name, a message, a researcher's own resource name — fails rather than
 * passing as "a reason was reported". Bound to the package's own
 * `ProtocolFileErrorKind` union by
 * `scripts/release-test/fresco-release-test-analytics.test.mjs`, so a kind
 * added there without being added here is a failing test rather than a check
 * that quietly rejects a legitimate reason.
 */
export const PROTOCOL_FILE_ERROR_KINDS = [
  'notArchive',
  'missingProtocol',
  'damagedJson',
  'missingNamedAsset',
  'missingAsset',
  'invalidAsset',
  'inflationLimit',
  'newerVersion',
  'cannotUpgrade',
  'upgradeStepFailed',
  'missingVersion',
  'invalidBeforeUpgrade',
  'upgradeFailed',
];

const asText = (buffer, encoding = 'utf8') => buffer.toString(encoding);

/**
 * Decodes one recorded request body into the events it carried.
 *
 * Returns `{ ok: false, reason }` rather than throwing or returning an empty
 * list: an unreadable body must be visible to the caller as unreadable, since
 * "no events" and "events nobody could read" are opposite findings.
 */
export function decodeBody(record) {
  if (record?.truncated)
    return { ok: false, reason: 'body exceeded the sink capture limit' };
  const base64 = record?.bodyBase64;
  if (typeof base64 !== 'string')
    return { ok: false, reason: 'record carries no body' };
  let raw;
  try {
    raw = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, reason: 'body is not base64' };
  }
  if (raw.length === 0) return { ok: true, events: [], text: '' };

  const query = String(record.path ?? '');
  const contentType = String(record.headers?.['content-type'] ?? '');
  const contentEncoding = String(record.headers?.['content-encoding'] ?? '');
  const compression = /compression=([\w-]+)/.exec(query)?.[1] ?? '';

  const candidates = [];
  const pushDecompressed = (buffer) => {
    candidates.push(buffer);
    // posthog-js picks its compression per request and says so in the query
    // string or the header; both are honoured, and a gzip body that arrives
    // with neither is still decompressed rather than reported unreadable.
    if (
      /gzip/.test(compression) ||
      /gzip/.test(contentEncoding) ||
      (buffer[0] === 0x1f && buffer[1] === 0x8b)
    ) {
      try {
        candidates.push(gunzipSync(buffer));
      } catch {
        /* fall through to the other candidates */
      }
    }
    if (/deflate/.test(compression) || /deflate/.test(contentEncoding)) {
      try {
        candidates.push(inflateSync(buffer));
      } catch {
        /* fall through */
      }
    }
  };
  pushDecompressed(raw);

  // The form-encoded shape: `data=<base64 of the JSON>`, still used by
  // posthog-js for beacons and for browsers without fetch compression.
  if (/x-www-form-urlencoded/.test(contentType)) {
    const params = new URLSearchParams(asText(raw));
    const data = params.get('data');
    if (data) {
      try {
        pushDecompressed(Buffer.from(data, 'base64'));
      } catch {
        /* fall through */
      }
      candidates.push(Buffer.from(data, 'utf8'));
    }
  }

  for (const candidate of candidates) {
    const text = asText(candidate);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    return { ok: true, events: collectEvents(parsed), text };
  }
  return {
    ok: false,
    reason: `body is not JSON in any known encoding (${contentType || 'no content-type'}${compression ? `, compression=${compression}` : ''})`,
  };
}

/**
 * Pulls every captured event out of a parsed body, whatever shape it arrived
 * in: posthog-js posts a bare event, an array of them or `{ batch }`, and
 * posthog-node posts `{ api_key, batch }`.
 */
function collectEvents(parsed) {
  if (Array.isArray(parsed))
    return parsed.filter((entry) => entry && typeof entry === 'object');
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['batch', 'events', 'data']) {
    if (Array.isArray(parsed[key]))
      return parsed[key].filter((entry) => entry && typeof entry === 'object');
  }
  return typeof parsed.event === 'string' ? [parsed] : [];
}

/**
 * Every recorded request, decoded once, with its events flattened.
 *
 * `unreadable` is carried rather than dropped: the checks below treat it as a
 * failure, because a payload nobody could read cannot evidence the absence of
 * anything in it.
 */
export function decodeRecords(records) {
  const requests = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== 'object') {
      // Still a request, still carrying the fields every consumer reads: a
      // malformed record must fail the readability check, not throw past it.
      requests.push({
        path: '',
        at: null,
        method: '',
        unreadable: 'not an object',
        text: '',
        events: [],
      });
      continue;
    }
    const decoded = decodeBody(record);
    requests.push({
      path: String(record.path ?? ''),
      at: typeof record.at === 'string' ? record.at : null,
      method: String(record.method ?? ''),
      unreadable: decoded.ok ? null : decoded.reason,
      text: decoded.ok ? decoded.text : '',
      events: decoded.ok ? decoded.events : [],
    });
  }
  return requests;
}

const propertiesOf = (event) =>
  event && typeof event.properties === 'object' && event.properties !== null
    ? event.properties
    : {};

/** Whether any key in a value matches, however deeply nested. */
function hasKey(value, keys, depth = 0) {
  if (depth > 12 || !value || typeof value !== 'object') return false;
  if (!Array.isArray(value))
    for (const key of Object.keys(value)) if (keys.includes(key)) return true;
  for (const entry of Object.values(value))
    if (hasKey(entry, keys, depth + 1)) return true;
  return false;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const check = (id, pass, detail) => ({
  id,
  status: pass ? 'pass' : 'fail',
  detail,
});

/**
 * The analytics lane's verdict on what an enabled deployment sent.
 *
 * `secrets` are the values this deployment holds that must never appear in a
 * payload, each named so a failure says which one leaked: the interview id
 * (a participant's whole credential), every node and edge `_uid` the walk
 * created, the participant's identifier and the researcher's username.
 *
 * `damagedImportFrom` is the ISO timestamp the driver recorded before it
 * imported the damaged protocol fixtures, so the "not an application error"
 * assertion reads only the window that import could have produced.
 *
 * `listeningRecords` is how many times the sink announced itself, which the
 * reader counts from the same file. Exactly one means it bound its ports once
 * and stayed up for the whole lane; any other number means its log does not
 * span one unbroken window, and a gap is a stretch in which traffic met a
 * closed port and left no trace.
 */
export function evaluateAnalyticsContract({
  records,
  secrets = [],
  damagedImportFrom = null,
  listeningRecords = 0,
}) {
  const requests = decodeRecords(records);
  const events = requests.flatMap((request) => request.events);
  const named = (name) => events.filter((event) => event.event === name);
  const checks = [];

  // --- positive controls --------------------------------------------------
  // Each one makes a later negative assertion mean something. They are checks
  // in their own right, not preconditions, so a lane that captured nothing
  // fails loudly instead of reporting a clean privacy sweep of an empty file.
  checks.push(
    check(
      'analytics-sink-listening',
      listeningRecords === 1,
      `the sink announced itself ${listeningRecords} time(s); exactly one means it was watching for one unbroken window`,
    ),
  );

  const unreadable = requests.filter((request) => request.unreadable);
  checks.push(
    check(
      'analytics-payloads-readable',
      requests.length > 0 && unreadable.length === 0,
      requests.length === 0
        ? 'the sink recorded no requests at all'
        : unreadable.length === 0
          ? `${requests.length} request(s) recorded, all decoded`
          : `${unreadable.length} of ${requests.length} request(s) could not be decoded: ${unreadable
              .map((request) => `${request.path}: ${request.unreadable}`)
              .join('; ')}`,
    ),
  );

  const initRequests = requests.filter((request) => isInitPath(request.path));
  checks.push(
    check(
      'analytics-initialised',
      initRequests.length > 0,
      `${initRequests.length} initialisation request(s) (remote config / feature flags) — init is what a disabled deployment never reaches`,
    ),
  );

  checks.push(
    check(
      'analytics-events-captured',
      events.length > 0,
      `${events.length} event(s) captured across ${requests.length} request(s)`,
    ),
  );

  const urlOf = (event) => String(propertiesOf(event).$current_url ?? '');
  const dashboardEvents = events.filter((event) =>
    /\/dashboard/.test(urlOf(event)),
  );
  const interviewEvents = events.filter((event) =>
    /\/interview\//.test(urlOf(event)),
  );
  checks.push(
    check(
      'analytics-both-surfaces-captured',
      dashboardEvents.length > 0 && interviewEvents.length > 0,
      `dashboard events: ${dashboardEvents.length}, participant interview events: ${interviewEvents.length} — the two surfaces start analytics by different paths, so neither covers the other`,
    ),
  );

  const serverEvents = events.filter(
    (event) => propertiesOf(event).$lib === 'posthog-node',
  );
  checks.push(
    check(
      'analytics-server-events-captured',
      serverEvents.length > 0,
      `${serverEvents.length} event(s) from the Fresco process itself — without one, nothing here describes what the SERVER sends`,
    ),
  );

  const entityIdEvents = events.filter((event) =>
    hasKey(propertiesOf(event), ENTITY_ID_PROPERTIES),
  );
  checks.push(
    check(
      'analytics-entity-ids-reported',
      entityIdEvents.length > 0,
      `${entityIdEvents.length} event(s) carry an entity id property (${ENTITY_ID_PROPERTIES.join(', ')}) — without one, "no raw _uid was sent" is vacuous`,
    ),
  );

  // --- the privacy contract ------------------------------------------------
  const replayRequests = requests.filter((request) =>
    isSessionRecordingPath(request.path),
  );
  const snapshots = named('$snapshot');
  checks.push(
    check(
      'analytics-no-session-replay',
      replayRequests.length === 0 && snapshots.length === 0,
      `${replayRequests.length} session-recording request(s), ${snapshots.length} $snapshot event(s) — replay records the page's own DOM, including the TOTP secret and freshly created API tokens, out of reach of before_send`,
    ),
  );

  const heatmapEvents = named('$$heatmap');
  const heatmapProps = events.filter((event) =>
    hasKey(propertiesOf(event), ['$heatmap_data']),
  );
  checks.push(
    check(
      'analytics-no-heatmaps',
      heatmapEvents.length === 0 && heatmapProps.length === 0,
      `${heatmapEvents.length} $$heatmap event(s), ${heatmapProps.length} event(s) carrying $heatmap_data — heatmaps key their payload by the full page URL, which on the dashboard holds the researcher's search text`,
    ),
  );

  const autocaptured = ELEMENT_EVENTS.filter(
    (name) => name !== '$$heatmap',
  ).flatMap(named);
  checks.push(
    check(
      'analytics-no-autocapture',
      autocaptured.length === 0,
      `${autocaptured.length} autocapture-family event(s) (${ELEMENT_EVENTS.join(', ')}) — a clicked node's name is a participant's answer`,
    ),
  );

  const withElementData = events.filter((event) =>
    hasKey(propertiesOf(event), ELEMENT_PROPERTIES),
  );
  checks.push(
    check(
      'analytics-no-element-data',
      withElementData.length === 0,
      `${withElementData.length} event(s) carry element data (${ELEMENT_PROPERTIES.join(', ')})`,
    ),
  );

  // Every identifier this deployment holds, looked for in every string of
  // every payload — properties, $set, event names, the lot. One rule covers
  // the interview id in an error report, a raw `_uid` in an entity property
  // and a participant identifier in a URL, and it cannot be satisfied by
  // renaming a property.
  const knownSecrets = (Array.isArray(secrets) ? secrets : []).filter(
    (secret) =>
      secret &&
      typeof secret.value === 'string' &&
      secret.value.length >= 8 &&
      typeof secret.name === 'string',
  );
  const leaks = [];
  for (const request of requests) {
    for (const secret of knownSecrets) {
      if (request.text.includes(secret.value))
        leaks.push(`${secret.name} in ${request.path || 'a request'}`);
    }
  }
  checks.push(
    check(
      'analytics-no-deployment-identifiers',
      knownSecrets.length > 0 && leaks.length === 0,
      knownSecrets.length === 0
        ? 'no identifiers were supplied to look for, so this check proved nothing'
        : leaks.length === 0
          ? `none of the ${knownSecrets.length} identifier(s) this deployment holds (${knownSecrets.map((secret) => secret.name).join(', ')}) appears in any payload`
          : `identifier(s) sent to the relay: ${[...new Set(leaks)].join('; ')}`,
    ),
  );

  // The distinct id groups a session's events. It must be a pseudonym minted
  // for the session, never the interview id — which the check above already
  // forbids by value; this one additionally requires it to be present, to be
  // pseudonym-shaped, and to be ONE pseudonym, since an id that changed per
  // event would satisfy "not the session id" while losing what it is for.
  // The runtime's own events, not everything the participant's page sent: the
  // host identifies its browser by the deployment's installation id (which is
  // a deployment, not a person, and is meant to be stable), while the claim
  // here is about the events the interview runtime emits — which used to carry
  // the interview session id, a participant's whole access credential.
  const runtimeEvents = interviewEvents.filter(
    (event) =>
      !event.event.startsWith('$') && propertiesOf(event).$lib === 'web',
  );
  const interviewDistinctIds = new Set(
    runtimeEvents.map((event) =>
      String(event.distinct_id ?? propertiesOf(event).distinct_id ?? ''),
    ),
  );
  interviewDistinctIds.delete('');
  checks.push(
    check(
      'analytics-pseudonymous-distinct-id',
      runtimeEvents.length > 0 &&
        interviewDistinctIds.size === 1 &&
        UUID.test([...interviewDistinctIds][0]),
      runtimeEvents.length === 0
        ? 'the interview runtime captured no events of its own, so nothing carried a distinct id to judge'
        : `${runtimeEvents.length} interview-runtime event(s) carry ${interviewDistinctIds.size} distinct id(s): ${[...interviewDistinctIds].join(', ') || 'none'}`,
    ),
  );

  // --- a damaged file is an answer about the file, not a fault -------------
  const after = (event, from) => {
    const timestamp = String(event.timestamp ?? '');
    return !from || !timestamp || timestamp >= from;
  };
  const importFailures = named('ProtocolImportFailed').filter((event) =>
    after(event, damagedImportFrom),
  );
  const exceptions = [...named('$exception'), ...named('$error')].filter(
    (event) => after(event, damagedImportFrom),
  );
  const reasons = importFailures.map((event) =>
    String(propertiesOf(event).reason ?? ''),
  );
  const unknownReasons = reasons.filter(
    (reason) => !PROTOCOL_FILE_ERROR_KINDS.includes(reason),
  );
  checks.push(
    check(
      'analytics-damaged-file-not-an-error',
      importFailures.length > 0 &&
        exceptions.length === 0 &&
        unknownReasons.length === 0,
      importFailures.length === 0
        ? 'no ProtocolImportFailed event was captured after the damaged imports, so nothing shows how they were reported'
        : exceptions.length > 0
          ? `${exceptions.length} exception event(s) were reported for a damaged file, which buries the failures that are real faults`
          : unknownReasons.length > 0
            ? `ProtocolImportFailed carried reason(s) outside the fixed vocabulary: ${unknownReasons.join(', ')} — a free-form reason can hold the researcher's own file and resource names`
            : `${importFailures.length} damaged import(s) reported as ${[...new Set(reasons)].join(', ')}, with no exception event`,
    ),
  );

  return { checks, requestCount: requests.length, eventCount: events.length };
}
