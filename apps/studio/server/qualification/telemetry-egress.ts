export const TELEMETRY_EGRESS_MARKER =
  'STUDIO_QUALIFICATION_TELEMETRY_EGRESS_V1';
export const TELEMETRY_PROCESS_EGRESS_MARKER =
  'STUDIO_QUALIFICATION_PROCESS_EGRESS_V1';
export const TELEMETRY_PROCESS_APIS = [
  'fetch',
  'http.request',
  'https.request',
  'net.connect',
  'dns.lookup',
  'dgram.send',
] as const;

export const TELEMETRY_DETECTOR_SOURCE = `
const { createServer } = require('node:net');
createServer((socket) => {
  process.stdout.write(${JSON.stringify(TELEMETRY_EGRESS_MARKER)} + '\\n');
  socket.destroy();
}).listen(443, '0.0.0.0');
`;

export const TELEMETRY_CANARY_SOURCE = `
const { connect } = require('node:net');
let attempts = 0;
function attempt() {
  const socket = connect(443, 'ph-relay.networkcanvas.com');
  socket.setTimeout(1_000, () => socket.destroy(new Error('timeout')));
  socket.once('connect', () => socket.end(() => process.exit(0)));
  socket.once('error', () => {
    socket.destroy();
    if (++attempts >= 40) process.exit(1);
    setTimeout(attempt, 50);
  });
}
attempt();
`;

// Invoke the implementation shipped in the image itself. The canary uses the
// runtime switch so the same command is a positive control with `on` and a
// wrong-off mutant check with `off`; it does not rely on the application
// startup path or on a mocked fetch implementation.
export const TELEMETRY_IMPLEMENTATION_CANARY_SOURCE = `
const { createServerTelemetry } = await import('./dist/telemetry.js');
const enabled = process.env.STUDIO_TELEMETRY === 'on';
const telemetry = await createServerTelemetry(enabled, {
  mode: 'self-hosted',
  runtime: 'web',
  version: 'qualification',
});
telemetry.capture('server_request', new Error('qualification canary'));
await telemetry.close();
`;

// Mounted into the real web and worker containers before their processes
// start. It records attempts rather than treating a blocked route as proof.
export const TELEMETRY_PROCESS_PRELOAD_SOURCE = `
const dns = require('node:dns');
const dgram = require('node:dgram');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const marker = ${JSON.stringify(TELEMETRY_PROCESS_EGRESS_MARKER)};
const privateHost = (value) => {
  const host = String(value || '').replace(/^\\[|\\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^(postgres|registry-postgres|minio|registry-minio|traefik)(?:[-.]|$)/.test(host)) return true;
  if (net.isIP(host) === 4) {
    const octets = host.split('.').map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254);
  }
  if (net.isIP(host) === 6)
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  return false;
};
const observe = (api, host, port) => {
  if (!privateHost(host)) process.stdout.write(marker + ' ' + JSON.stringify({ api, host: String(host), port }) + '\\n');
};
const target = (input, options) => {
  if (typeof input === 'string' || input instanceof URL) {
    const url = new URL(String(input));
    return { host: url.hostname, port: url.port || undefined };
  }
  const value = options || input || {};
  return { host: value.hostname || value.host || value.address, port: value.port };
};
const wrap = (object, name, api, getTarget = (...args) => target(...args)) => {
  const original = object[name];
  if (typeof original !== 'function') return;
  object[name] = function (...args) {
    const value = getTarget(...args);
    if (value) observe(api, value.host, value.port);
    return original.apply(this, args);
  };
};
wrap(net, 'connect', 'net.connect');
wrap(net.Socket.prototype, 'connect', 'net.connect');
wrap(http, 'request', 'http.request');
wrap(https, 'request', 'https.request');
wrap(dns, 'lookup', 'dns.lookup', (host) => ({ host }));
for (const name of ['resolve', 'resolve4', 'resolve6']) wrap(dns, name, 'dns.lookup', (host) => ({ host }));
if (dns.promises) {
  for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) wrap(dns.promises, name, 'dns.lookup', (host) => ({ host }));
}
if (typeof globalThis.fetch === 'function') {
  const fetch = globalThis.fetch;
  globalThis.fetch = function (input, options) {
    const value = target(input, options);
    observe('fetch', value.host, value.port);
    return fetch.call(this, input, options);
  };
}
const createSocket = dgram.createSocket;
dgram.createSocket = function (...args) {
  const socket = createSocket.apply(this, args);
  const send = socket.send.bind(socket);
  socket.send = function (message, ...rest) {
    const address = typeof rest[1] === 'string' ? rest[1] : rest[2]?.address;
    const port = typeof rest[0] === 'number' ? rest[0] : rest[1]?.port;
    observe('dgram.send', address, port);
    return send(message, ...rest);
  };
  return socket;
};
`;

export const TELEMETRY_PROCESS_CANARY_SOURCE = `
const net = require('node:net');
const dgram = require('node:dgram');
const http = require('node:http');
const https = require('node:https');
const testNet = '192.0.2.123';
try { net.connect({ host: testNet, port: 9 }).on('error', () => {}); } catch {}
try { http.request({ host: testNet, port: 80 }).on('error', () => {}).end(); } catch {}
try { https.request({ host: testNet, port: 443 }).on('error', () => {}).end(); } catch {}
try { fetch('http://' + testNet + '/qualification', { signal: AbortSignal.timeout(100) }).catch(() => {}); } catch {}
try { require('node:dns').lookup(testNet, () => {}); } catch {}
try { const socket = dgram.createSocket('udp4'); socket.on('error', () => {}); socket.send(Buffer.from('qualification'), 9, testNet, () => socket.close()); } catch {}
setTimeout(() => process.exit(0), 250);
`;

function telemetryEgressCount(logs: string) {
  return logs.split(TELEMETRY_EGRESS_MARKER).length - 1;
}

export function assertNoTelemetryEgress(logs: string) {
  if (telemetryEgressCount(logs) !== 0)
    throw new Error('Running-image telemetry qualification detected egress.');
}

export function assertTelemetryDetectorPositive(logs: string) {
  if (telemetryEgressCount(logs) !== 1)
    throw new Error('Running-image telemetry detector control failed.');
}

export function assertTelemetryDetectorObserved(logs: string) {
  if (telemetryEgressCount(logs) < 1)
    throw new Error('Running-image telemetry implementation control failed.');
}

function processTelemetryEgressCount(logs: string) {
  return logs.split(TELEMETRY_PROCESS_EGRESS_MARKER).length - 1;
}

export function assertNoProcessTelemetryEgress(logs: string) {
  if (processTelemetryEgressCount(logs) !== 0)
    throw new Error(
      'Instrumented running-image telemetry qualification detected egress.',
    );
}

export function assertProcessTelemetryInstrumentationPositive(logs: string) {
  for (const api of TELEMETRY_PROCESS_APIS)
    if (!logs.includes(`${TELEMETRY_PROCESS_EGRESS_MARKER} {"api":"${api}"`))
      throw new Error(`Process egress instrumentation missed ${api}.`);
}
