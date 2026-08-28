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
