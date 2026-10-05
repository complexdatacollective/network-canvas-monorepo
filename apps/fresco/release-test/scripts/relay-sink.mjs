// The analytics egress sink for the Fresco release-test stacks.
//
// Both lanes alias the PostHog relay's hostname (ph-relay.networkcanvas.com,
// `@codaco/shared-consts` POSTHOG_HOST) onto this container, so anything in
// the stack that tries to reach the relay reaches this process instead. It
// exists to observe the one thing the browser network logs structurally
// cannot: traffic the Fresco container itself originates, which is where
// `lib/posthog-server.ts` would send server-side events if a deployment with
// analytics disabled ever constructed its posthog-node client.
//
// It deliberately does NOT terminate TLS. posthog-node speaks https, so a sink
// that parsed requests would need a certificate for the relay's name in the
// app container's trust store — which means minting a CA and setting
// NODE_EXTRA_CA_CERTS on the image under test, i.e. testing a container
// configured differently from the one that ships, and presenting the
// deployment with a relay that appears to work. Neither buys anything the gate
// uses: the question it asks is whether the container reached off-box for
// analytics at all, and an accepted TCP connection answers that completely.
// Accepting and logging the connection is also strictly more sensitive than
// parsing would be, because it fires before any handshake can fail.
//
// Every accepted connection is written to stdout as one JSON line, which
// relay-sink-check.mjs reads back with `docker logs`. Records go to stdout and
// nothing else does: the reader treats an unparseable line on that stream as an
// unaccounted connection, so diagnostics belong on stderr, which `docker logs`
// keeps separate.
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';

import {
  classify,
  IDENTIFY_MS,
  READY_FILE,
  SINK_PORTS,
} from './relay-sink-protocol.mjs';

// Enough to hold the marker and its nonce; the rest of any request is
// irrelevant and never read.
const IDENTIFY_BYTES = 128;

const record = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`);

// Every connection is written down TWICE: once the instant it is accepted, and
// again once it has been classified. The first line is what makes the log
// complete at any moment. Classification cannot be immediate — a client that
// stalls, or sends less than a full identifying prefix, is not known until the
// timeout expires — so a log written only at classification time is missing
// every connection accepted within the last IDENTIFY_MS, and a reader that
// snapshots it reports those as silence.
//
// The pair is joined by `seq`, so a reader can see an accepted connection that
// has not yet been classified and count it as egress: nothing that has not
// identified itself as a probe may be read as one.
let accepted = 0;

function handle(socket, port) {
  const seq = ++accepted;
  record({ at: new Date().toISOString(), kind: 'accepted', seq, port });

  const chunks = [];
  let length = 0;
  let settled = false;

  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    const { kind, nonce } = classify(Buffer.concat(chunks, length));
    record({
      at: new Date().toISOString(),
      seq,
      port,
      kind,
      ...(nonce ? { nonce } : {}),
    });
    socket.destroy();
  };

  const timer = setTimeout(settle, IDENTIFY_MS);
  socket.on('data', (chunk) => {
    chunks.push(chunk);
    length += chunk.length;
    if (length >= IDENTIFY_BYTES) settle();
  });
  // A client that connects and goes away without sending anything still made a
  // connection attempt, and settle() classifies an empty read as egress.
  socket.on('end', settle);
  socket.on('close', settle);
  socket.on('error', settle);
}

await Promise.all(
  SINK_PORTS.map(
    (port) =>
      new Promise((resolve, reject) => {
        const server = createServer((socket) => handle(socket, port));
        server.on('error', reject);
        server.listen(port, '0.0.0.0', () => resolve(server));
      }),
  ),
);

// Only now: the healthcheck reads this file, and the app container starts once
// it appears.
writeFileSync(READY_FILE, `${new Date().toISOString()}\n`);
record({ at: new Date().toISOString(), kind: 'listening', ports: SINK_PORTS });
