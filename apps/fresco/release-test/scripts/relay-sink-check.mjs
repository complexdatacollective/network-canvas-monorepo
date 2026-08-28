#!/usr/bin/env node
// Reads one lane's analytics egress sink and prints a single JSON line.
//
// The sink (relay-sink.mjs) is aliased onto the PostHog relay's hostname for
// every container in the lane's stack, so a Fresco container that tried to
// send server-side analytics would connect to it. This script answers two
// questions about that, in one place, so the workflow's agent has nothing to
// decide:
//
//   Was the sink actually watching?  It probes the sink FROM INSIDE the lane's
//   Fresco container, on every port the sink covers, using the relay's real
//   hostname and a nonce generated here. A probe that comes back recorded
//   proves the whole path the real thing would take — that container's
//   resolution of that hostname, the sink listening on that port, and the sink
//   recording what it receives. Without it, a sink that never started, or an
//   alias that never took effect, would read exactly like a silent deployment.
//
//   Did anything else connect?  Every connection the sink recorded that is not
//   one of this invocation's probes is egress. That includes connections it
//   could not identify: an unreadable connection is reported as egress, never
//   dropped.
//
// Exits non-zero, with "ok": false and a reason, whenever it cannot answer
// either question. Usage: relay-sink-check.mjs --lane upgrade|fresh
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { PROBE_MARKER, SINK_PORTS } from './relay-sink-protocol.mjs';

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

let sinkRunning = false;
try {
  sinkRunning =
    docker([
      'inspect',
      '--format',
      '{{.State.Running}}',
      sinkContainer,
    ]).trim() === 'true';
} catch (error) {
  fail(`could not inspect ${sinkContainer}: ${reason(error)}`);
}
if (!sinkRunning)
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

// docker exec returns as soon as the probe's socket closes; the sink settles
// and records on its own side. Give it a moment before reading the log.
await new Promise((resolve) => setTimeout(resolve, 1000));

let raw = '';
try {
  raw = docker(['logs', sinkContainer]);
} catch (error) {
  fail(`could not read ${sinkContainer} logs: ${reason(error)}`);
}

// Only the sink's stdout: `docker logs` demultiplexes the container's streams,
// and execFileSync returns stdout alone, so a runtime warning on stderr can
// never be miscounted as a connection.
//
// A line the sink wrote that this cannot parse IS counted as egress, not
// discarded: the sink writes one line per connection, so an unreadable line is
// an unaccounted connection.
let probeConnections = 0;
let analyticsConnections = 0;
let logLines = 0;
for (const line of raw.split('\n')) {
  const text = line.trim();
  if (!text) continue;
  logLines += 1;
  let entry;
  try {
    entry = JSON.parse(text);
  } catch {
    analyticsConnections += 1;
    continue;
  }
  if (entry?.kind === 'listening') continue;
  if (entry?.kind === 'probe') {
    if (entry.nonce === nonce) probeConnections += 1;
    continue;
  }
  analyticsConnections += 1;
}

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
