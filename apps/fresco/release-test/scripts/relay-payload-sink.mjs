// The payload-recording analytics sink, for the release test's analytics lane.
//
// That lane is the one deployment in the run with analytics ENABLED, and the
// question it asks is what an enabled deployment actually sends. A connection
// sink (relay-sink.mjs) cannot answer it: the whole finding lives in the
// request bodies. So this one terminates TLS with the certificate up.sh mints
// for the run, answers like the relay would, and writes every request down.
//
// Both the Fresco container and the lane's browser reach it under the relay's
// real hostname — the container through the compose network alias, the browser
// through Chromium's host-resolver rules — so one file holds the server-side
// and browser-side halves of the same conversation.
//
// It records and judges nothing. `relay-payload-protocol.mjs` holds the
// decoding and the privacy contract, so the oracle is exercised on synthetic
// records in CI rather than only by running a stack.
//
// Two deliberate choices:
//
// - It answers 200 with a plausible body. A relay that refused would make
//   posthog-js retry and eventually give up, and a lane that captured a
//   deployment's retry behaviour rather than its steady-state traffic is
//   testing the sink.
// - A body larger than the cap is recorded as `truncated`, never silently
//   shortened. The contract treats a truncated record as unreadable and fails,
//   because a payload nobody read cannot evidence the absence of anything in
//   it — and the payload most likely to be enormous is exactly the one the
//   lane exists to forbid (a session replay snapshot).
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { dirname } from 'node:path';

import { captureFile, TLS_DIR } from './relay-payload-protocol.mjs';
import { READY_FILE, SINK_PORTS } from './relay-sink-protocol.mjs';

const LANE = process.env.RELAY_LANE ?? 'analytics';
const OUT = captureFile(LANE);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

mkdirSync(dirname(OUT), { recursive: true });
// Truncate rather than append: a file left by an earlier run would be read as
// this run's traffic, and this lane's findings are about what THIS build sent.
writeFileSync(OUT, '');

const record = (entry) => {
  appendFileSync(OUT, `${JSON.stringify(entry)}\n`);
};

function handle(scheme, request, response) {
  const chunks = [];
  let length = 0;
  let truncated = false;

  request.on('data', (chunk) => {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      truncated = true;
      return;
    }
    chunks.push(chunk);
  });

  const done = () => {
    record({
      at: new Date().toISOString(),
      scheme,
      method: request.method,
      path: request.url,
      headers: request.headers,
      bodyBytes: length,
      truncated,
      bodyBase64: truncated ? '' : Buffer.concat(chunks).toString('base64'),
    });
    // posthog-js loads its optional extensions from /static/*.js. They are
    // all disabled at init, but the loader still fetches some of them, and a
    // JSON body where a script belongs can leave init half-finished — which
    // would cost the lane the events it exists to read. An empty script is a
    // truthful answer: nothing extra runs.
    const isScript = /\.js(\?|$)/.test(String(request.url ?? ''));
    response.writeHead(200, {
      'content-type': isScript ? 'application/javascript' : 'application/json',
      // posthog-js is a browser client on a different origin, and a blocked
      // preflight would be a request the lane never sees the body of.
      'access-control-allow-origin': request.headers.origin ?? '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    });
    // Enough of a remote config for posthog-js to finish initialising with
    // every optional extension off — the sink must not be what turns session
    // replay on or off, and it must not ask the client to load a script it
    // cannot serve.
    if (isScript) {
      response.end('');
      return;
    }
    response.end(
      JSON.stringify({
        status: 1,
        config: { enable_collect_everything: false },
        sessionRecording: false,
        captureDeadClicks: false,
        capturePerformance: false,
        autocapture_opt_out: true,
        featureFlags: {},
        flags: {},
        supportedCompression: ['gzip-js'],
      }),
    );
  };

  request.on('end', done);
  request.on('error', done);
}

const listeners = [];
for (const port of SINK_PORTS) {
  const handler = (scheme) => (request, response) =>
    handle(scheme, request, response);
  const server =
    port === 443
      ? createHttpsServer(
          {
            key: readFileSync(`${TLS_DIR}/key.pem`),
            cert: readFileSync(`${TLS_DIR}/cert.pem`),
          },
          handler('https'),
        )
      : createHttpServer(handler('http'));
  listeners.push(
    new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, '0.0.0.0', () => resolve(server));
    }),
  );
}
await Promise.all(listeners);

// Only now: the compose healthcheck reads this file and the app container
// starts once it appears, so nothing can send before there is somewhere to
// record it.
writeFileSync(READY_FILE, `${new Date().toISOString()}\n`);
record({ at: new Date().toISOString(), kind: 'listening', ports: SINK_PORTS });
process.stdout.write(
  `[relay-payload-sink] recording ${LANE} to ${OUT} on ${SINK_PORTS.join(', ')}\n`,
);
