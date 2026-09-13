export const TELEMETRY_EGRESS_MARKER =
  'STUDIO_QUALIFICATION_TELEMETRY_EGRESS_V1';
export const TELEMETRY_PROCESS_EGRESS_MARKER =
  'STUDIO_QUALIFICATION_PROCESS_EGRESS_V1';
export const TELEMETRY_KERNEL_READY_MARKER =
  'STUDIO_QUALIFICATION_KERNEL_READY_V1';
export const TELEMETRY_KERNEL_LIVENESS_MARKER =
  'STUDIO_QUALIFICATION_KERNEL_LIVENESS_V1';
export const TELEMETRY_KERNEL_CONTROL_MARKER =
  'STUDIO_QUALIFICATION_KERNEL_CONTROL_V1';
export const TELEMETRY_KERNEL_EGRESS_MARKER =
  'STUDIO_QUALIFICATION_KERNEL_EGRESS_V1';
export const TELEMETRY_PROCESS_APIS = [
  'fetch',
  'http.request',
  'https.request',
  'net.connect',
  'dns.lookup',
  'dgram.send',
] as const;
export const TELEMETRY_KERNEL_SERVICES = [
  'studio',
  'worker',
  'registry',
] as const;

function telemetryKernelEndpoints(
  service: (typeof TELEMETRY_KERNEL_SERVICES)[number],
) {
  const controlHost =
    service === 'registry'
      ? 'telemetry-control-registry'
      : 'telemetry-control-data';
  const allowed =
    service === 'registry'
      ? [
          { protocol: 'tcp', host: 'registry-postgres', port: 5432 },
          { protocol: 'tcp', host: 'registry-minio', port: 9000 },
        ]
      : [
          { protocol: 'tcp', host: 'postgres', port: 5432 },
          { protocol: 'tcp', host: 'minio', port: 9000 },
        ];
  return JSON.stringify({
    allowed,
    controls: [
      { protocol: 'tcp', host: controlHost, port: 8443 },
      { protocol: 'udp', host: controlHost, port: 8443 },
    ],
  });
}

export const TELEMETRY_DETECTOR_SOURCE = `
const { createServer: createTcpServer } = require('node:net');
const { createServer: createHttpServer } = require('node:http');
const { createSocket } = require('node:dgram');
createTcpServer((socket) => {
  process.stdout.write(${JSON.stringify(TELEMETRY_EGRESS_MARKER)} + '\\n');
  socket.destroy();
}).listen(443, '0.0.0.0');
createHttpServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': '2' });
  response.end('ok');
}).listen(8443, '0.0.0.0');
createSocket('udp4').bind(8443, '0.0.0.0');
createTcpServer((socket) => setTimeout(() => socket.destroy(), 500)).listen(9443, '0.0.0.0');
createSocket('udp4').bind(9443, '0.0.0.0');
`;

export type KernelFlow = {
  protocol: 'tcp' | 'udp';
  source: string;
  destination: string;
  sourcePort: number;
  destinationPort: number;
};

export function parseConntrackFlow(line: string): KernelFlow | undefined {
  const fields = line.trim().split(/\s+/u);
  const protocol = fields[2];
  if (protocol !== 'tcp' && protocol !== 'udp') return undefined;
  const firstTuple = fields.slice(0, 16);
  const property = (name: string) =>
    firstTuple
      .find((field) => field.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  const source = property('src');
  const destination = property('dst');
  const sourcePort = Number(property('sport'));
  const destinationPort = Number(property('dport'));
  if (
    !source ||
    !destination ||
    !Number.isInteger(sourcePort) ||
    !Number.isInteger(destinationPort) ||
    sourcePort < 1 ||
    sourcePort > 65_535 ||
    destinationPort < 1 ||
    destinationPort > 65_535
  )
    return undefined;
  return { protocol, source, destination, sourcePort, destinationPort };
}

// This script is mounted into a qualification-only sidecar that shares the
// target service's network namespace. It observes kernel conntrack state, so a
// child process that removes NODE_OPTIONS remains visible.
export const TELEMETRY_KERNEL_OBSERVER_SOURCE = `
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const dns = require('node:dns').promises;
const dgram = require('node:dgram');
const net = require('node:net');
const os = require('node:os');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const maximumSnapshotBytes = 4 * 1024 * 1024;
const ready = ${JSON.stringify(TELEMETRY_KERNEL_READY_MARKER)};
const liveness = ${JSON.stringify(TELEMETRY_KERNEL_LIVENESS_MARKER)};
const controlMarker = ${JSON.stringify(TELEMETRY_KERNEL_CONTROL_MARKER)};
const egressMarker = ${JSON.stringify(TELEMETRY_KERNEL_EGRESS_MARKER)};
const parseConntrackFlow = (line) => {
  const fields = line.trim().split(/\\s+/u);
  const protocol = fields[2];
  if (protocol !== 'tcp' && protocol !== 'udp') return undefined;
  const firstTuple = fields.slice(0, 16);
  const property = (name) =>
    firstTuple.find((field) => field.startsWith(name + '='))?.slice(name.length + 1);
  const source = property('src');
  const destination = property('dst');
  const sourcePort = Number(property('sport'));
  const destinationPort = Number(property('dport'));
  if (!source || !destination || !Number.isInteger(sourcePort) ||
      !Number.isInteger(destinationPort) || sourcePort < 1 || sourcePort > 65535 ||
      destinationPort < 1 || destinationPort > 65535) return undefined;
  return { protocol, source, destination, sourcePort, destinationPort };
};
const input = JSON.parse(process.env.STUDIO_QUALIFICATION_KERNEL_ENDPOINTS || 'null');
if (!input || !Array.isArray(input.allowed) || !Array.isArray(input.controls))
  throw new Error('Kernel qualification endpoints are invalid.');
const resolveEndpoints = async (entries) => {
  const resolved = [];
  for (const entry of entries) {
    if (!entry || !['tcp', 'udp'].includes(entry.protocol) ||
        typeof entry.host !== 'string' || !Number.isInteger(entry.port))
      throw new Error('Kernel qualification endpoint is invalid.');
    const addresses = await dns.lookup(entry.host, { all: true, verbatim: true });
    if (addresses.length === 0) throw new Error('Kernel qualification endpoint did not resolve.');
    for (const { address } of addresses)
      resolved.push(entry.protocol + '|' + address + '|' + entry.port);
  }
  return new Set(resolved);
};
const main = async () => {
  const [allowed, controls] = await Promise.all([
    resolveEndpoints(input.allowed), resolveEndpoints(input.controls),
  ]);
  allowed.add('udp|127.0.0.11|53');
  allowed.add('tcp|127.0.0.11|53');
  allowed.add('tcp|127.0.0.1|3000');
  allowed.add('tcp|::1|3000');
  const local = new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean).map(({ address }) => address));
  const seen = new Set();
  let sequence = 0;
  const readConntrack = async () => {
    const proc = process.env.STUDIO_QUALIFICATION_CONNTRACK_PROC || '/proc/net/nf_conntrack';
    let descriptor;
    try {
      descriptor = fs.openSync(proc, 'r');
      const chunks = [];
      let size = 0;
      while (true) {
        const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximumSnapshotBytes + 1 - size));
        const bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length);
        if (bytesRead === 0) return Buffer.concat(chunks, size).toString('utf8');
        chunks.push(chunk.subarray(0, bytesRead));
        size += bytesRead;
        if (size > maximumSnapshotBytes) {
          const error = new Error('Kernel conntrack snapshot exceeded the observer limit.');
          error.code = 'OUTPUT_LIMIT';
          throw error;
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    const { stdout } = await execute('conntrack', ['-L', '-o', 'extended'], {
      encoding: 'utf8',
      maxBuffer: maximumSnapshotBytes,
      timeout: 1_000,
    });
    return stdout;
  };
  const scan = async () => {
    const bytes = await readConntrack();
    for (const line of bytes.split('\\n')) {
      const flow = parseConntrackFlow(line);
      if (!flow || !local.has(flow.source)) continue;
      const key = flow.protocol + '|' + flow.destination + '|' + flow.destinationPort;
      const identity = key + '|' + flow.sourcePort;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (allowed.has(key)) continue;
      const evidence = JSON.stringify({
        protocol: flow.protocol,
        destination: flow.destination,
        port: flow.destinationPort,
      });
      process.stdout.write((controls.has(key) ? controlMarker : egressMarker) + ' ' + evidence + '\\n');
    }
  };
  await scan();
  fs.writeFileSync(process.env.STUDIO_QUALIFICATION_KERNEL_READY_FILE || '/tmp/kernel-ready', '', { mode: 0o600 });
  const networkNamespace = process.env.STUDIO_QUALIFICATION_NETWORK_NAMESPACE || fs.readlinkSync('/proc/self/ns/net');
  process.stdout.write(ready + ' ' + JSON.stringify({ networkNamespace }) + '\\n');
  const scheduleScan = () => setTimeout(() => {
    scan().then(scheduleScan).catch(fail);
  }, 100);
  scheduleScan();
  setInterval(() => { process.stdout.write(liveness + ' ' + Date.now() + ' ' + (++sequence) + '\\n'); }, 500);
  for (const endpoint of input.controls) {
    if (endpoint.protocol === 'tcp') {
      const socket = net.connect(endpoint.port, endpoint.host);
      socket.on('error', () => {});
      setTimeout(() => socket.destroy(), 750);
    } else {
      const socket = dgram.createSocket('udp4');
      socket.on('error', () => {});
      const interval = setInterval(() => socket.send(Buffer.from('kernel qualification'), endpoint.port, endpoint.host, () => {}), 50);
      setTimeout(() => { clearInterval(interval); socket.close(); }, 750);
    }
  }
};
const fail = (error) => {
  const code = typeof error?.code === 'string' && /^[A-Z_]{1,40}$/.test(error.code) ? error.code : 'UNKNOWN';
  process.stderr.write('Kernel qualification observer failed: ' + code + '\\n');
  process.exit(1);
};
main().catch(fail);
`;

export function telemetryKernelComposeServices(
  image: string,
  observerImage: string,
) {
  const namespaceServices = `  telemetry-namespace-studio:
    image: ${image}
    entrypoint: [node, -e]
    command: ["setInterval(() => {}, 60000)"]
    networks:
      edge:
        aliases: [studio]
      data:
        aliases: [studio]
  telemetry-namespace-worker:
    image: ${image}
    entrypoint: [node, -e]
    command: ["setInterval(() => {}, 60000)"]
    networks:
      edge:
        aliases: [worker]
      data:
        aliases: [worker]
  telemetry-namespace-registry:
    image: ${image}
    entrypoint: [node, -e]
    command: ["setInterval(() => {}, 60000)"]
    networks:
      edge:
        aliases: [registry]
      registry-data:
        aliases: [registry]
  studio:
    network_mode: service:telemetry-namespace-studio
    networks: !reset []
  worker:
    network_mode: service:telemetry-namespace-worker
    networks: !reset []
  registry:
    network_mode: service:telemetry-namespace-registry
    networks: !reset []
`;
  return (
    namespaceServices +
    TELEMETRY_KERNEL_SERVICES.map(
      (service) => `  telemetry-kernel-${service}:
    image: ${observerImage}
    user: '0:0'
    entrypoint: [node, -e]
    command: [${JSON.stringify(TELEMETRY_KERNEL_OBSERVER_SOURCE)}]
    environment:
      STUDIO_QUALIFICATION_KERNEL_ENDPOINTS: '${telemetryKernelEndpoints(service)}'
    network_mode: service:telemetry-namespace-${service}
    restart: unless-stopped
    read_only: true
    tmpfs: ["/tmp:size=1m,mode=1777"]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    cap_add: [NET_ADMIN]
    healthcheck:
      test: [CMD, node, -e, "require('node:fs').accessSync('/tmp/kernel-ready')"]
      interval: 100ms
      timeout: 1s
      retries: 100
`,
    ).join('')
  );
}

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
const originalExit = process.exit;
process.exit = (code) => { process.exitCode = code ?? 1; };
await import('./dist/index.js');
setTimeout(() => process.emit('uncaughtException', new Error('qualification canary')), 250);
setTimeout(() => { process.exit = originalExit; originalExit(0); }, 1_500);
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
  if (host === 'localhost' || host === 'postgres' || host === 'registry-postgres' ||
      host === 'minio' || host === 'registry-minio' || host === 'traefik') return true;
  if (net.isIP(host) === 4) return host.startsWith('127.') || host.startsWith('0.');
  return net.isIP(host) === 6 && host === '::1';
};
const observe = (api, host, port, keys) => {
  if (!privateHost(host)) process.stdout.write(marker + ' ' + JSON.stringify({ api, host: String(host), port, keys }) + '\\n');
};
const target = (input, options) => {
  if (input instanceof URL) {
    return { host: input.hostname, port: input.port || undefined, keys: [] };
  }
  if (typeof input === 'string') {
    try {
      const url = new URL(input);
      return { host: url.hostname, port: url.port || undefined, keys: [] };
    } catch {
      return target(options || {}, undefined);
    }
  }
  const value =
    options && typeof options === 'object' ? options : input || {};
  if (value.socketPath || value.fd !== undefined)
    return { host: 'localhost', port: undefined, keys: [] };
  return { host: value.hostname || value.host || value.address, port: value.port, keys: Object.keys(value) };
};
const netTarget = (input, options) => {
  if (Array.isArray(input)) return netTarget(...input);
  if (typeof input === 'number')
    return { host: typeof options === 'string' ? options : 'localhost', port: input, keys: [] };
  if (typeof input === 'string' && typeof options === 'number')
    return { host: input, port: options, keys: [] };
  return target(input, options);
};
const wrap = (object, name, api, getTarget = (...args) => target(...args)) => {
  const original = object[name];
  if (typeof original !== 'function') return;
  object[name] = function (...args) {
    const value = getTarget(...args);
    if (value) observe(api, value.host, value.port, value.keys);
    return original.apply(this, args);
  };
};
wrap(net, 'connect', 'net.connect', netTarget);
wrap(net.Socket.prototype, 'connect', 'net.connect', netTarget);
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
const lookalike = 'postgres.example.test';
try { net.connect({ host: testNet, port: 9 }).on('error', () => {}); } catch {}
try { http.request({ host: testNet, port: 80 }).on('error', () => {}).end(); } catch {}
try { https.request({ host: testNet, port: 443 }).on('error', () => {}).end(); } catch {}
try { fetch('http://' + testNet + '/qualification', { signal: AbortSignal.timeout(100) }).catch(() => {}); } catch {}
try { fetch('http://' + lookalike + '/qualification', { signal: AbortSignal.timeout(100) }).catch(() => {}); } catch {}
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
  if (
    !logs.includes(
      `${TELEMETRY_PROCESS_EGRESS_MARKER} {"api":"fetch","host":"postgres.example.test"`,
    )
  )
    throw new Error(
      'Process egress instrumentation accepted an external lookalike host.',
    );
}

export function assertKernelTelemetryReady(logs: string, now = Date.now()) {
  if (!logs.includes(TELEMETRY_KERNEL_READY_MARKER))
    throw new Error('Kernel egress observer did not become ready.');
  const liveness = logs
    .split('\n')
    .filter((line) => line.startsWith(`${TELEMETRY_KERNEL_LIVENESS_MARKER} `))
    .map((line) => Number(line.split(/\s+/u)[1]));
  if (liveness.length < 2 || !Number.isFinite(liveness.at(-1)))
    throw new Error('Kernel egress observer did not remain live.');
  if (now - liveness.at(-1)! > 2_000)
    throw new Error('Kernel egress observer liveness is stale.');
}

export function assertNoKernelTelemetryEgress(logs: string) {
  if (logs.includes(TELEMETRY_KERNEL_EGRESS_MARKER))
    throw new Error('Kernel egress observer detected egress.');
}

export function assertKernelTelemetryEgressProtocols(logs: string) {
  for (const protocol of ['tcp', 'udp'])
    if (
      !logs.includes(
        `${TELEMETRY_KERNEL_EGRESS_MARKER} {"protocol":"${protocol}"`,
      )
    )
      throw new Error(`Kernel egress observer missed ${protocol} egress.`);
}

export function assertKernelTelemetryControls(logs: string) {
  for (const protocol of ['tcp', 'udp'])
    if (
      !logs.includes(
        `${TELEMETRY_KERNEL_CONTROL_MARKER} {"protocol":"${protocol}"`,
      )
    )
      throw new Error(`Kernel egress observer missed ${protocol} control.`);
}

export function kernelTelemetryControlCount(logs: string) {
  return logs.split(TELEMETRY_KERNEL_CONTROL_MARKER).length - 1;
}

export function assertNativeChildTelemetryControl(
  before: number,
  logs: string,
) {
  if (kernelTelemetryControlCount(logs) <= before)
    throw new Error('Kernel egress observer missed the native child control.');
}
