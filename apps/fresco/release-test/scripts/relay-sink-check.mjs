#!/usr/bin/env node
// Reads one lane's analytics egress sink and prints a single JSON line.
//
// The sink (relay-sink.mjs) is aliased onto the PostHog relay's hostname for
// every container in the lane's stack, so a Fresco container that tried to
// send server-side analytics would connect to it. This script answers three
// questions about that, in one place, so the workflow's agent has nothing to
// decide:
//
//   Was the sink watching at all?  It probes the sink FROM INSIDE the lane's
//   Fresco container, on every port the sink covers, using the relay's real
//   hostname and a nonce generated here. A probe that comes back recorded
//   proves the whole path the real thing would take — that container's
//   resolution of that hostname, the sink listening on that port, and the sink
//   recording what it receives. Without it, a sink that never started, or an
//   alias that never took effect, would read exactly like a silent deployment.
//
//   Was it watching for the WHOLE window it reports on?  `docker logs`
//   succeeds against a container that has already exited, and the probe
//   records survive in it, so a sink checked only once would report a clean,
//   well-controlled reading of a stretch it spent dead. Two inspections
//   bracket the check, and the sink's own start-up announcement — which it
//   writes exactly once — covers everything the lane did before it.
//
//   Did anything else connect?  Every connection the sink recorded that is not
//   one of this invocation's probes is egress. That includes connections it
//   could not identify, and ones it accepted but has not finished reading: an
//   unidentified connection is reported as egress, never dropped.
//
// Exits non-zero, with "ok": false and a reason, whenever it cannot answer any
// of them. Usage: relay-sink-check.mjs --lane upgrade|fresh
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import {
  PROBE_MARKER,
  SETTLE_WAIT_MS,
  SINK_PORTS,
  tally,
  windowIntegrity,
} from './relay-sink-protocol.mjs';

const args = process.argv.slice(2);
let lane = '';
while (args.length) {
  const arg = args.shift();
  if (arg === '--lane') lane = args.shift() ?? '';
  else {
    process.stderr.write(`Unknown argument: ${arg}\n`);
    process.exit(2);
  }
}
if (lane !== 'upgrade' && lane !== 'fresh') {
  process.stderr.write('Usage: relay-sink-check.mjs --lane upgrade|fresh\n');
  process.exit(2);
}

const project = `fresco-release-test-${lane}`;
const sinkContainer = `${project}-relay-sink-1`;
const appContainer = `${project}-fresco-1`;
// The hostname the app would really use, resolved inside the app container by
// the compose network alias. Probing an IP, or probing from the host, would
// prove less than the thing being tested.
const RELAY_HOST = 'ph-relay.networkcanvas.com';

const fail = (error) => {
  process.stdout.write(`${JSON.stringify({ lane, ok: false, error })}\n`);
  process.exit(1);
};

// stderr is captured rather than inherited: this script's own stdout is the
// only thing its caller reads, and docker's diagnostics belong inside the
// "error" field rather than loose in the agent's transcript.
const docker = (dockerArgs) =>
  execFileSync('docker', dockerArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

// Flattened onto one line: the error travels into the workflow's findings,
// where a newline would break the reading it belongs to.
const reason = (error) =>
  String(error?.message ?? error)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

// Read together, so the pair can be compared later: a container that died and
// came back would report Running again but with a different start time, and
// the gap between them is a window in which connections were refused rather
// than recorded.
const inspectSink = (when) => {
  try {
    const [running, startedAt] = docker([
      'inspect',
      '--format',
      '{{.State.Running}} {{.State.StartedAt}}',
      sinkContainer,
    ])
      .trim()
      .split(' ');
    return { running: running === 'true', startedAt };
  } catch (error) {
    fail(`could not inspect ${sinkContainer} ${when}: ${reason(error)}`);
    return null;
  }
};

const before = inspectSink('before probing');
if (!before.running)
  fail(
    `${sinkContainer} is not running, so nothing observed what the ${lane} lane's container sent`,
  );

// One nonce per invocation: a probe record carrying it cannot have come from
// an earlier check of the same container.
const nonce = randomBytes(12).toString('hex');
const probe = (port) => `
const socket = require('node:net').connect(${port}, ${JSON.stringify(RELAY_HOST)});
let done = false;
const finish = (code, message) => {
  if (done) return;
  done = true;
  if (message) process.stderr.write(message + '\\n');
  socket.destroy();
  process.exit(code);
};
socket.setTimeout(10000);
socket.on('connect', () => socket.end(${JSON.stringify(`${PROBE_MARKER} ${nonce}\n`)}));
socket.on('close', () => finish(0));
socket.on('error', (error) => finish(1, error.message));
socket.on('timeout', () => finish(1, 'timed out'));
`;

let probeSent = 0;
for (const port of SINK_PORTS) {
  try {
    docker(['exec', appContainer, 'node', '-e', probe(port)]);
    probeSent += 1;
  } catch (error) {
    fail(
      `the ${lane} lane's Fresco container could not reach ${RELAY_HOST}:${port}: ${reason(error)} — the sink was not watching that port, so silence there would prove nothing`,
    );
  }
}

// Egress completeness does not depend on this wait — the sink writes a line
// the instant it accepts a connection, and anything accepted-but-unclassified
// is counted as egress below. The wait is what keeps that from reading as a
// FALSE no-go: a connection is not classified until it identifies itself or
// the sink's timeout expires, so reading too early would count this run's own
// probes, and any genuinely benign late arrival, as unidentified traffic.
// Waiting out the sink's own timeout means all but the last instant's
// connections are classified precisely rather than conservatively.
await new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS));

// THE LOG READ IS THE LAST OBSERVATION THIS CHECK MAKES.
//
// That ordering is the invariant, not an incidental arrangement. Everything
// reported here describes an interval, and the evidence for it comes from two
// samples taken at different moments — the container inspections, and the log.
// Whenever the verified interval extends past the log snapshot, a connection
// accepted in between is real, is not in the log, and is reported as silence.
// Reading the log last makes the log's coverage a superset of the verified
// interval, so that cannot happen: any connection accepted while the sink was
// known to be alive was written down before this snapshot was taken.
//
// The cost is that connections accepted between the inspection and the read
// are also included, and are counted conservatively as egress. That is the
// right direction to err, and this is the last thing the lane does, so there
// is nothing left to provoke one.
const atClose = inspectSink('after settling');

let raw = '';
try {
  raw = docker(['logs', sinkContainer]);
} catch (error) {
  fail(`could not read ${sinkContainer} logs: ${reason(error)}`);
}

// Only the sink's stdout: `docker logs` demultiplexes the container's streams,
// and execFileSync returns stdout alone, so a runtime warning on stderr can
// never be miscounted as a connection.
const { probeConnections, analyticsConnections, logLines, listeningRecords } =
  tally(raw, nonce);

// Whether the sink was watching for the whole window it reports on. Decided in
// the protocol module so every branch can be exercised directly rather than
// read; this is only the wording.
const WINDOW_FAILURES = {
  stopped: `${sinkContainer} stopped during the check, so anything the ${lane} lane's container sent after it died was refused rather than recorded`,
  restarted: `${sinkContainer} did not run unbroken across the check (${before.startedAt} -> ${atClose.startedAt}), leaving a window in which egress was refused rather than recorded`,
  announcements: `${sinkContainer} announced itself ${listeningRecords} time(s) rather than once, so its log does not cover one unbroken listening window`,
};
const broken = windowIntegrity({ before, atClose, listeningRecords });
if (broken) fail(WINDOW_FAILURES[broken]);

process.stdout.write(
  `${JSON.stringify({
    lane,
    ok: true,
    sinkRunning: true,
    sinkPorts: SINK_PORTS.length,
    probeSent,
    probeConnections,
    analyticsConnections,
    logLines,
  })}\n`,
);
