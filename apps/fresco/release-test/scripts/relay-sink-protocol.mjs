// The wire contract between the release-test analytics sink (relay-sink.mjs)
// and the script that reads it (relay-sink-check.mjs). Shared rather than
// duplicated: the probe marker and the port list are the whole oracle, and a
// drift between the two sides would make the sink's silence unfalsifiable.
//
// Kept free of side effects so relay-sink-check.mjs can import it without
// starting a server.

// Ports the compose alias makes reachable on the sink. 443 is what
// posthog-node uses for https://ph-relay.networkcanvas.com; 80 is covered so a
// client that fell back to http is recorded rather than refused.
export const SINK_PORTS = [443, 80];

// relay-sink-check.mjs opens a connection starting with this marker followed
// by a per-invocation nonce. Any other opening bytes — a TLS ClientHello,
// plaintext, or nothing at all — are egress.
export const PROBE_MARKER = 'FRESCO-RELEASE-TEST-PROBE';

// Written by the sink once every port is bound. The compose healthcheck waits
// on it, so the app container is never started against a sink that is not yet
// listening: a refused connection would be egress that went unrecorded.
export const READY_FILE = '/tmp/relay-sink-listening';

// How long the sink gives a connection to identify itself before classifying
// it. A client that says nothing within it is egress, not a probe.
export const IDENTIFY_MS = 3000;

// How long a reader must wait after the last thing it did before the sink's
// log can be treated as complete. A socket accepted just before the read, that
// stalls or sends a short prefix, is not classified until IDENTIFY_MS has
// passed — read sooner and that connection is reported as silence. The margin
// covers the write and docker's own log latency.
export const SETTLE_WAIT_MS = IDENTIFY_MS + 1500;

/**
 * Classifies a connection from the first bytes it sent.
 *
 * Deliberately lopsided. Only a connection that opens with the marker is a
 * probe; everything else, including a connection that sent nothing, is egress.
 * A sink that cannot tell what it received must not report silence.
 */
export function classify(firstBytes) {
  if (!firstBytes || firstBytes.length === 0) return { kind: 'egress' };
  const text = firstBytes.toString('latin1');
  if (!text.startsWith(PROBE_MARKER)) return { kind: 'egress' };
  const nonce = text.slice(PROBE_MARKER.length).trim().split(/\s+/)[0] ?? '';
  return { kind: 'probe', nonce };
}

/**
 * Counts what a sink's log says, from the reader's point of view.
 *
 * Pure, and exported, because this is the whole oracle: `probeConnections` is
 * the positive control and `analyticsConnections` is the verdict. It is tested
 * directly rather than only through a running stack.
 *
 * Two rules, both deliberately conservative:
 *
 * - A connection the sink accepted but has not yet classified counts as
 *   egress. It was a connection attempt whether or not the sink has finished
 *   reading it, and "not yet known" must never be reported as "not egress".
 * - A line that cannot be read counts as egress, for the same reason.
 *
 * Probe records from an earlier invocation carry a different nonce. They are
 * not this run's control and are not held against the build either.
 */
export function tally(raw, nonce) {
  const accepted = new Set();
  const classified = new Map();
  let unreadable = 0;
  let logLines = 0;
  // The sink writes exactly one of these, when it finishes binding. More than
  // one means it restarted, and a restart leaves a gap in which connections
  // were refused rather than recorded; none means this log did not come from a
  // sink that ever started listening.
  let listeningRecords = 0;

  for (const line of String(raw ?? '').split('\n')) {
    const text = line.trim();
    if (!text) continue;
    logLines += 1;
    let entry;
    try {
      entry = JSON.parse(text);
    } catch {
      unreadable += 1;
      continue;
    }
    if (entry?.kind === 'listening') {
      listeningRecords += 1;
      continue;
    }
    if (!Number.isInteger(entry?.seq)) {
      unreadable += 1;
      continue;
    }
    if (entry.kind === 'accepted') accepted.add(entry.seq);
    else if (entry.kind === 'probe' || entry.kind === 'egress')
      classified.set(entry.seq, entry);
    else unreadable += 1;
  }

  let probeConnections = 0;
  for (const entry of classified.values())
    if (entry.kind === 'probe' && entry.nonce === nonce) probeConnections += 1;

  let analyticsConnections = unreadable;
  for (const seq of new Set([...accepted, ...classified.keys()])) {
    const entry = classified.get(seq);
    if (!entry || entry.kind !== 'probe') analyticsConnections += 1;
  }

  return { probeConnections, analyticsConnections, logLines, listeningRecords };
}

/**
 * Decides whether the sink was watching for the whole window it reports on.
 *
 * Pure, and separate from the script that gathers the observations, because a
 * decision embedded in a shell-driven script can only be checked by reading it
 * — and reading a condition does not prove it still fires. Every branch here
 * is exercised directly.
 *
 * Takes the two container inspections that bracket the check and the number of
 * times the sink announced itself, and returns why the window is not
 * trustworthy, or null if it is.
 */
export function windowIntegrity({ before, atClose, listeningRecords }) {
  // Alive at the end, not merely at the start: `docker logs` succeeds against
  // a container that has already exited, and the probe records survive in it,
  // so a sink that died mid-check would otherwise report a clean reading of a
  // window it spent dead.
  if (!atClose?.running) return 'stopped';
  // A container that died and came back reports Running again. Comparing start
  // times is what separates the two — and an unreadable start time is not
  // evidence of anything, so it fails rather than comparing equal to itself.
  if (
    typeof before?.startedAt !== 'string' ||
    before.startedAt.length === 0 ||
    atClose.startedAt !== before.startedAt
  )
    return 'restarted';
  // The inspections bracket the check; this covers everything before it. The
  // sink announces itself once when it binds, so any other number means its log
  // does not span one unbroken listening window — and a gap is a stretch in
  // which egress met a closed port and left no trace. It also catches a log
  // that was rotated away beneath us, which loses the announcement.
  if (listeningRecords !== 1) return 'announcements';
  return null;
}
